create table public.seller_orders (
  id uuid primary key default gen_random_uuid(),
  payment_order_id uuid unique references public.payment_orders(id) on delete restrict,
  reference text not null,
  packaging_cost numeric(12,2) not null default 0 check (packaging_cost >= 0),
  shipping_cost numeric(12,2) not null default 0 check (shipping_cost >= 0),
  shipping_collected numeric(12,2) not null default 0 check (shipping_collected >= 0),
  shipping_source text not null default 'manual' check (shipping_source in ('manual','courier','estimate')),
  created_at timestamptz not null default now()
);
alter table public.seller_orders enable row level security;
create policy "Admins read order costs" on public.seller_orders for select to authenticated
  using (public.is_catalogue_admin());
revoke all on public.seller_orders from anon, authenticated;
grant select on public.seller_orders to authenticated;
grant all on public.seller_orders to service_role;
alter table public.seller_sales add column order_id uuid references public.seller_orders(id) on delete cascade;
create index seller_sales_order_idx on public.seller_sales(order_id);

-- Preserve historical costs; website lines share one order, older manual rows remain separate orders.
insert into public.seller_orders(payment_order_id,reference,packaging_cost,shipping_cost,shipping_collected,shipping_source)
select p.id,p.reference,sum(s.packaging_cost*s.quantity),
  coalesce(max(case when os.awb is not null then os.approved_charge end),sum(s.shipping_cost)),
  p.shipping_paise/100.0,
  case when max(os.awb) is not null then 'courier' else 'estimate' end
from public.seller_sales s join public.payment_order_items i on i.id=s.payment_order_item_id
join public.payment_orders p on p.id=i.order_id
left join public.order_shipping os on os.order_id=p.id
group by p.id;
update public.seller_sales s set order_id=o.id
from public.payment_order_items i join public.seller_orders o on o.payment_order_id=i.order_id
where s.payment_order_item_id=i.id;
insert into public.seller_orders(id,reference,packaging_cost,shipping_cost)
select s.id,'SALE-'||s.id::text,s.packaging_cost*s.quantity,s.shipping_cost
from public.seller_sales s where s.order_id is null;
update public.seller_sales set order_id=id where order_id is null;
update public.seller_sales set packaging_cost=0,shipping_cost=0;
alter table public.seller_sales alter column order_id set not null;

create function public.attach_sale_order() returns trigger
language plpgsql security definer set search_path='' as $$
declare p public.payment_orders; target uuid;
begin
  if tg_op='UPDATE' then
    if new.order_id is distinct from old.order_id or new.payment_order_item_id is distinct from old.payment_order_item_id then
      raise exception 'Sale order identity cannot be changed.';
    end if;
    if new.packaging_cost<>0 or new.shipping_cost<>0 then
      raise exception 'Set packaging and shipping on the whole order, not an item.';
    end if;
    if (new.sale_date is distinct from old.sale_date or new.channel is distinct from old.channel)
      and (select count(*) from public.seller_sales where order_id=old.order_id)>1 then
      raise exception 'Order item date and channel cannot be changed independently.';
    end if;
    return new;
  end if;
  if new.payment_order_item_id is not null then
    select order_id into target from public.seller_sales where payment_order_item_id=new.payment_order_item_id;
    if target is not null then
      new.order_id=target; new.packaging_cost=0; new.shipping_cost=0;
      return new;
    end if;
    select po.* into strict p from public.payment_orders po
      join public.payment_order_items i on i.order_id=po.id where i.id=new.payment_order_item_id;
    insert into public.seller_orders(payment_order_id,reference,packaging_cost,shipping_cost,shipping_collected,shipping_source)
      values(p.id,p.reference,new.packaging_cost*new.quantity,new.shipping_cost,p.shipping_paise/100.0,'estimate')
      on conflict(payment_order_id) do update set packaging_cost=public.seller_orders.packaging_cost+excluded.packaging_cost
      returning id into target;
    new.order_id=target;
  elsif new.order_id is null then
    insert into public.seller_orders(reference,packaging_cost,shipping_cost)
      values('SALE-'||new.id::text,new.packaging_cost*new.quantity,new.shipping_cost) returning id into target;
    new.order_id=target;
  elsif new.packaging_cost<>0 or new.shipping_cost<>0 then
    raise exception 'Set packaging and shipping on the whole order, not an item.';
  end if;
  new.packaging_cost=0; new.shipping_cost=0;
  return new;
end $$;
create trigger attach_sale_order before insert or update on public.seller_sales
  for each row execute function public.attach_sale_order();
revoke all on function public.attach_sale_order() from public,anon,authenticated;

create function public.sync_courier_order_cost() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.awb is not null and new.approved_charge is not null then
    update public.seller_orders set shipping_cost=new.approved_charge,shipping_source='courier'
    where payment_order_id=new.order_id and shipping_source<>'manual';
  end if;
  return new;
end $$;
create trigger sync_courier_order_cost after insert or update of awb,approved_charge on public.order_shipping
  for each row execute function public.sync_courier_order_cost();
revoke all on function public.sync_courier_order_cost() from public,anon,authenticated;

create function public.save_seller_order_costs(p_order_id uuid,p_packaging numeric,p_shipping numeric,p_source text)
returns void language plpgsql security definer set search_path='' as $$
declare o public.seller_orders; charge numeric;
begin
  if not public.is_catalogue_admin() then raise exception 'Admin verification required.'; end if;
  if p_packaging is null or p_shipping is null or p_packaging::text in ('NaN','Infinity','-Infinity')
    or p_shipping::text in ('NaN','Infinity','-Infinity') or p_packaging<0 or p_shipping<0
    or p_packaging>1000000 or p_shipping>1000000 or p_source is null or p_source not in ('manual','courier') then
    raise exception 'Enter valid whole-order packaging and shipping costs.';
  end if;
  select * into strict o from public.seller_orders where id=p_order_id for update;
  charge=p_shipping;
  if p_source='courier' then
    select approved_charge into charge from public.order_shipping where order_id=o.payment_order_id and awb is not null;
    if charge is null then raise exception 'Book and confirm a courier AWB before using its shipping cost.'; end if;
  end if;
  update public.seller_orders set packaging_cost=p_packaging,shipping_cost=charge,shipping_source=p_source where id=p_order_id;
end $$;

create function public.create_seller_order(p_items jsonb,p_packaging numeric,p_shipping numeric)
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
      ('quantity','unit_price','gst_percent','material_cost','labour_cost','gateway_fee_percent','gateway_fee_gst_percent')
      and value in ('NaN','Infinity','-Infinity')) then raise exception 'Order amounts must be finite.'; end if;
    if (item->>'sale_date')::date is distinct from first_date or item->>'channel' is distinct from first_channel then
      raise exception 'All order items must use the same sale date and channel.';
    end if;
    insert into public.seller_sales(order_id,product_id,product_name,variant_name,sale_date,channel,quantity,
      unit_price,gst_percent,material_cost,labour_cost,packaging_cost,shipping_cost,
      gateway_fee_percent,gateway_fee_gst_percent,notes)
    values(target,(item->>'product_id')::uuid,item->>'product_name',coalesce(item->>'variant_name',''),first_date,first_channel,
      (item->>'quantity')::integer,(item->>'unit_price')::numeric,(item->>'gst_percent')::numeric,
      (item->>'material_cost')::numeric,(item->>'labour_cost')::numeric,0,0,
      (item->>'gateway_fee_percent')::numeric,(item->>'gateway_fee_gst_percent')::numeric,coalesce(item->>'notes',''));
  end loop;
  return target;
end $$;

create function public.delete_seller_order(p_order_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not public.is_catalogue_admin() then raise exception 'Admin verification required.'; end if;
  delete from public.seller_orders where id=p_order_id;
  if not found then raise exception 'Order not found. Refresh the ledger.'; end if;
end $$;
revoke all on function public.save_seller_order_costs(uuid,numeric,numeric,text),
  public.create_seller_order(jsonb,numeric,numeric),public.delete_seller_order(uuid) from public,anon;
grant execute on function public.save_seller_order_costs(uuid,numeric,numeric,text),
  public.create_seller_order(jsonb,numeric,numeric),public.delete_seller_order(uuid) to authenticated;
