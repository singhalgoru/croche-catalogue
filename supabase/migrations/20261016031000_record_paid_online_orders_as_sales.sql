-- Paid live storefront orders are added to the seller sales ledger automatically,
-- one 'online' sale per order line, so the sales dashboard and bestsellers
-- include website orders without manual entry. Orders paid before this
-- migration are intentionally not backfilled to avoid duplicating manual entries.
alter table public.seller_sales
  add column if not exists payment_order_item_id uuid
    references public.payment_order_items(id) on delete set null;

create unique index if not exists seller_sales_payment_order_item_idx
  on public.seller_sales (payment_order_item_id)
  where payment_order_item_id is not null;

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
        m.gst_percent, m.time_spent, m.time_unit, m.material_cost, m.packaging_cost, m.shipping_cost
      from public.payment_order_items i
      left join public.products p on p.id = i.product_id
      left join public.product_profit_margins m on m.product_id = p.id
      where i.order_id = new.id
      order by i.line_total_paise desc, i.id
    loop
      line_index := line_index + 1;
      -- Spread any coupon discount across lines by value; the last line takes the remainder.
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
        gateway_fee_percent, gateway_fee_gst_percent, notes, payment_order_item_id
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
          else round(case when item.time_unit = 'minutes' then item.time_spent / 60.0 else item.time_spent end * 100, 2) end,
        coalesce(item.packaging_cost, 0),
        case when shipping_recorded then 0 else coalesce(item.shipping_cost, 0) end,
        2, 18,
        left(format('Website order %s recorded automatically.%s%s', new.reference,
          case when line_discount > 0 then format(' Coupon discount ₹%s applied to this line.', to_char(line_discount / 100.0, 'FM999999990.00')) else '' end,
          case when not shipping_recorded and coalesce(new.shipping_paise, 0) > 0
            then format(' Customer paid ₹%s shipping for the order.', to_char(new.shipping_paise / 100.0, 'FM999999990.00')) else '' end), 1000),
        item.id
      ) on conflict (payment_order_item_id) where payment_order_item_id is not null do nothing;
      shipping_recorded := true;
    end loop;
  exception when others then
    raise warning 'Unable to record sales for paid order %: %', new.reference, sqlerrm;
  end;
  return new;
end;
$$;
revoke all on function public.record_paid_order_sales() from public, anon, authenticated;

drop trigger if exists record_paid_order_sales on public.payment_orders;
create trigger record_paid_order_sales after update of status on public.payment_orders
for each row execute function public.record_paid_order_sales();
