alter table public.payment_orders
  add column fulfilment_status text not null default 'confirmed'
    check (fulfilment_status in ('confirmed','processing','shipped','delivered')),
  add column courier_name text not null default '',
  add column tracking_number text not null default '',
  add column tracking_url text not null default '',
  add column fulfilment_updated_at timestamptz,
  add column fulfilment_updated_by uuid references auth.users(id) on delete set null;

create function public.update_order_fulfilment(target_order_id uuid, expected_status text,
  new_status text, courier text, tracking text, tracking_link text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare o public.payment_orders;
begin
  if not public.is_catalogue_admin() then raise exception 'Catalogue admin access required.'; end if;
  if new_status is null or new_status not in ('confirmed','processing','shipped','delivered') then
    raise exception 'Invalid fulfilment status.';
  end if;
  if courier is null or tracking is null or tracking_link is null
    or length(courier)>100 or length(tracking)>150 or length(tracking_link)>1000 then
    raise exception 'Invalid courier or tracking details.';
  end if;
  courier:=btrim(courier); tracking:=btrim(tracking); tracking_link:=btrim(tracking_link);
  if tracking_link<>'' and (tracking_link !~ '^https://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?([/:?#]|$)'
    or tracking_link ~ '[[:space:]<>"]' or split_part(substring(tracking_link from 9),'/',1) ~ '@') then
    raise exception 'Tracking link must be a public HTTPS URL.';
  end if;
  select * into o from public.payment_orders where id=target_order_id for update;
  if not found or not o.is_live_checkout or o.status<>'paid' then
    raise exception 'Only paid online orders can be processed or shipped.';
  end if;
  if o.fulfilment_status is distinct from expected_status then
    raise exception 'Order status changed. Refresh orders before saving.';
  end if;
  if array_position(array['confirmed','processing','shipped','delivered'],new_status)
    < array_position(array['confirmed','processing','shipped','delivered'],o.fulfilment_status) then
    raise exception 'Order status cannot move backwards.';
  end if;
  if new_status in ('confirmed','processing') and (courier<>'' or tracking<>'' or tracking_link<>'') then
    raise exception 'Tracking details are available for shipped or delivered orders.';
  end if;
  update public.payment_orders set fulfilment_status=new_status,courier_name=courier,
    tracking_number=tracking,tracking_url=tracking_link,fulfilment_updated_at=now(),
    fulfilment_updated_by=auth.uid() where id=o.id;
  return jsonb_build_object('status',new_status,'courierName',courier,'trackingNumber',tracking,
    'trackingUrl',tracking_link,'updatedAt',now());
end;
$$;
revoke all on function public.update_order_fulfilment(uuid,text,text,text,text,text) from public,anon;
grant execute on function public.update_order_fulfilment(uuid,text,text,text,text,text) to authenticated;

create function public.with_order_fulfilment(entries jsonb)
returns jsonb language sql security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(entry || jsonb_build_object('fulfilment',case
    when o.is_live_checkout and o.status='paid' then jsonb_build_object(
      'status',o.fulfilment_status,'courierName',o.courier_name,'trackingNumber',o.tracking_number,
      'trackingUrl',o.tracking_url,'updatedAt',o.fulfilment_updated_at) else null end) order by position),'[]'::jsonb)
  from jsonb_array_elements(entries) with ordinality as items(entry,position)
  join public.payment_orders o on o.id=(entry->>'id')::uuid;
$$;
revoke all on function public.with_order_fulfilment(jsonb) from public,anon,authenticated;

alter function public.get_admin_live_orders(integer) rename to get_admin_live_orders_without_fulfilment;
revoke all on function public.get_admin_live_orders_without_fulfilment(integer) from public,anon,authenticated;
create function public.get_admin_live_orders(page_offset integer default 0)
returns jsonb language sql security definer set search_path = ''
as $$ select public.with_order_fulfilment(public.get_admin_live_orders_without_fulfilment(page_offset)); $$;
revoke all on function public.get_admin_live_orders(integer) from public,anon;
grant execute on function public.get_admin_live_orders(integer) to authenticated;

alter function public.get_customer_orders(integer) rename to get_customer_orders_without_fulfilment;
revoke all on function public.get_customer_orders_without_fulfilment(integer) from public,anon,authenticated;
create function public.get_customer_orders(page_offset integer default 0)
returns jsonb language sql security definer set search_path = ''
as $$ select public.with_order_fulfilment(public.get_customer_orders_without_fulfilment(page_offset)); $$;
revoke all on function public.get_customer_orders(integer) from public,anon;
grant execute on function public.get_customer_orders(integer) to authenticated;
