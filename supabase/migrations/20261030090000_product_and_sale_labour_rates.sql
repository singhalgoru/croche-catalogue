alter table public.product_profit_margins
  add column labour_rate numeric check(labour_rate is null or labour_rate between 0 and 10000);

alter table public.seller_sales
  add column labour_time_spent numeric,
  add column labour_time_unit text,
  add column labour_rate numeric,
  add constraint seller_sales_labour_calculation check(
    (labour_time_spent is null and labour_time_unit is null and labour_rate is null)
    or (labour_time_spent is not null and labour_time_unit is not null and labour_rate is not null
      and labour_time_spent >= 0 and labour_time_spent::text not in ('NaN','Infinity','-Infinity')
      and labour_time_unit in ('hours','minutes') and labour_rate between 0 and 10000)
  );

create or replace function public.create_seller_order(p_items jsonb,p_packaging numeric,p_shipping numeric)
returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid; item jsonb; first_date date; first_channel text;
begin
  if not public.is_catalogue_admin() then raise exception 'Admin verification required.'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 100
    or p_packaging is null or p_shipping is null or p_packaging::text in ('NaN','Infinity','-Infinity')
    or p_shipping::text in ('NaN','Infinity','-Infinity') or p_packaging<0 or p_shipping<0
    or p_packaging>1000000 or p_shipping>1000000 then raise exception 'Invalid order items or costs.'; end if;
  first_date=(p_items->0->>'sale_date')::date;
  first_channel=p_items->0->>'channel';
  insert into public.seller_orders(reference,packaging_cost,shipping_cost)
    values('MANUAL-'||gen_random_uuid()::text,p_packaging,p_shipping) returning id into target;
  for item in select value from jsonb_array_elements(p_items) loop
    if exists(select 1 from jsonb_each_text(item) where key in
      ('quantity','unit_price','gst_percent','material_cost','labour_cost','gateway_fee_percent','gateway_fee_gst_percent',
        'labour_time_spent','labour_rate')
      and value in ('NaN','Infinity','-Infinity')) then raise exception 'Order amounts must be finite.'; end if;
    if (item->>'sale_date')::date is distinct from first_date or item->>'channel' is distinct from first_channel then
      raise exception 'All order items must use the same sale date and channel.';
    end if;
    insert into public.seller_sales(order_id,product_id,product_name,variant_name,sale_date,channel,quantity,
      unit_price,gst_percent,material_cost,labour_cost,packaging_cost,shipping_cost,
      gateway_fee_percent,gateway_fee_gst_percent,notes,labour_time_spent,labour_time_unit,labour_rate)
    values(target,(item->>'product_id')::uuid,item->>'product_name',coalesce(item->>'variant_name',''),first_date,first_channel,
      (item->>'quantity')::integer,(item->>'unit_price')::numeric,(item->>'gst_percent')::numeric,
      (item->>'material_cost')::numeric,(item->>'labour_cost')::numeric,0,0,
      (item->>'gateway_fee_percent')::numeric,(item->>'gateway_fee_gst_percent')::numeric,coalesce(item->>'notes',''),
      (item->>'labour_time_spent')::numeric,item->>'labour_time_unit',(item->>'labour_rate')::numeric);
  end loop;
  return target;
end $$;

create or replace function public.record_paid_order_sales()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  item record;
  line_count integer;
  line_index integer := 0;
  allocated_discount bigint := 0;
  line_discount bigint;
  net_paise bigint;
  shipping_recorded boolean := false;
begin
  if not (new.is_live_checkout and not new.is_test_checkout
    and new.status = 'paid' and old.status is distinct from 'paid') then
    return new;
  end if;

  -- The sales ledger must never block payment settlement.
  begin
    select count(*) into line_count from public.payment_order_items where order_id = new.id;
    for item in
      select i.id, i.product_id, i.product_name, i.variant_name, i.quantity, i.line_total_paise,
        p.id as live_product_id,
        (select count(*) from public.product_variants v where v.product_id = p.id) as variant_count,
        m.gst_percent, m.time_spent, m.time_unit, m.labour_rate, m.material_cost, m.packaging_cost, m.shipping_cost
      from public.payment_order_items i
      left join public.products p on p.id = i.product_id
      left join public.product_profit_margins m on m.product_id = p.id
      where i.order_id = new.id
      order by i.line_total_paise desc, i.id
    loop
      line_index := line_index + 1;
      line_discount := case
        when coalesce(new.discount_paise, 0) <= 0 or coalesce(new.subtotal_paise, 0) <= 0 then 0
        when line_index = line_count then new.discount_paise - allocated_discount
        else round(new.discount_paise::numeric * item.line_total_paise / new.subtotal_paise)::bigint
      end;
      allocated_discount := allocated_discount + line_discount;
      net_paise := item.line_total_paise - line_discount;

      insert into public.seller_sales (
        product_id, product_name, variant_name, sale_date, channel, quantity, unit_price,
        gst_percent, material_cost, labour_cost, packaging_cost, shipping_cost,
        gateway_fee_percent, gateway_fee_gst_percent, notes, payment_order_item_id,
        labour_time_spent,labour_time_unit,labour_rate
      ) values (
        item.live_product_id,
        left(item.product_name, 150),
        case when item.variant_count > 1 then left(coalesce(item.variant_name, ''), 100) else '' end,
        (coalesce(new.paid_at, now()) at time zone 'Asia/Kolkata')::date,
        'online',
        item.quantity,
        greatest(0.01, round(net_paise::numeric / item.quantity / 100, 2)),
        coalesce(item.gst_percent, 5),
        coalesce(item.material_cost, 0),
        case when item.time_spent is null then 0
          else round(case when item.time_unit = 'minutes' then item.time_spent / 60.0 else item.time_spent end
            * coalesce(item.labour_rate,100), 2) end,
        coalesce(item.packaging_cost, 0),
        case when shipping_recorded then 0 else coalesce(item.shipping_cost, 0) end,
        2, 18,
        left(format('Website order %s recorded automatically.%s%s', new.reference,
          case when line_discount > 0 then format(' Coupon discount ₹%s applied to this line.', to_char(line_discount / 100.0, 'FM999999990.00')) else '' end,
          case when not shipping_recorded and coalesce(new.shipping_paise, 0) > 0
            then format(' Customer paid ₹%s shipping for the order.', to_char(new.shipping_paise / 100.0, 'FM999999990.00')) else '' end), 1000),
        item.id,
        item.time_spent,
        case when item.time_spent is not null then coalesce(item.time_unit,'hours') end,
        case when item.time_spent is not null then coalesce(item.labour_rate,100) end
      ) on conflict (payment_order_item_id) where payment_order_item_id is not null do nothing;
      shipping_recorded := true;
    end loop;
  exception when others then
    raise warning 'Unable to record sales for paid order %: %', new.reference, sqlerrm;
  end;
  return new;
end;
$$;
