alter table public.seller_sales
  add column marketing_percent numeric not null default 0 check (marketing_percent between 0 and 100),
  add column returns_reserve_percent numeric not null default 0 check (returns_reserve_percent between 0 and 100),
  add column overhead_percent numeric not null default 0 check (overhead_percent between 0 and 100);

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
        'labour_time_spent','labour_rate','marketing_percent','returns_reserve_percent','overhead_percent')
      and value in ('NaN','Infinity','-Infinity')) then raise exception 'Order amounts must be finite.'; end if;
    if (item->>'sale_date')::date is distinct from first_date or item->>'channel' is distinct from first_channel then
      raise exception 'All order items must use the same sale date and channel.';
    end if;
    insert into public.seller_sales(order_id,product_id,product_name,variant_name,sale_date,channel,quantity,
      unit_price,gst_percent,material_cost,labour_cost,packaging_cost,shipping_cost,
      gateway_fee_percent,gateway_fee_gst_percent,notes,labour_time_spent,labour_time_unit,labour_rate,
      marketing_percent,returns_reserve_percent,overhead_percent)
    values(target,(item->>'product_id')::uuid,item->>'product_name',coalesce(item->>'variant_name',''),first_date,first_channel,
      (item->>'quantity')::integer,(item->>'unit_price')::numeric,(item->>'gst_percent')::numeric,
      (item->>'material_cost')::numeric,(item->>'labour_cost')::numeric,0,0,
      (item->>'gateway_fee_percent')::numeric,(item->>'gateway_fee_gst_percent')::numeric,coalesce(item->>'notes',''),
      (item->>'labour_time_spent')::numeric,item->>'labour_time_unit',(item->>'labour_rate')::numeric,
      coalesce((item->>'marketing_percent')::numeric,0),coalesce((item->>'returns_reserve_percent')::numeric,0),
      coalesce((item->>'overhead_percent')::numeric,0));
  end loop;
  return target;
end $$;
