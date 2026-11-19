alter table public.order_shipping
  add column provider text not null default 'shiprocket'
  check (provider in ('shiprocket','delhivery'));

create or replace function public.save_order_shipping_quote(p_order_id uuid, p_package jsonb, p_quotes jsonb, p_actor uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare o public.payment_orders; s public.order_shipping;
begin
  if p_actor is null then raise exception 'Shipping approval identity required.'; end if;
  select * into o from public.payment_orders where id=p_order_id for update;
  if not found or o.status<>'paid' or not o.is_live_checkout or o.is_test_checkout
    or o.fulfilment_status not in ('confirmed','processing') or o.tracking_number<>'' then
    raise exception 'Only paid, unshipped live orders can be quoted.';
  end if;
  insert into public.order_shipping(order_id,created_by) values(o.id,p_actor) on conflict do nothing;
  select * into s from public.order_shipping where order_id=o.id for update;
  if s.operation is not null or s.review_required or s.shipment_id is not null or s.awb is not null then
    raise exception 'Shipment already exists, is running or needs reconciliation.';
  end if;
  update public.order_shipping set provider='shiprocket',package=p_package,quotes=p_quotes,
    quoted_at=now(),last_error=null,updated_at=now() where order_id=o.id;
end $$;

create function public.save_delhivery_shipping_quote(p_order_id uuid, p_package jsonb, p_quotes jsonb, p_actor uuid)
returns void language plpgsql security definer set search_path=''
as $$
begin
  perform public.save_order_shipping_quote(p_order_id,p_package,p_quotes,p_actor);
  update public.order_shipping set provider='delhivery' where order_id=p_order_id;
end $$;
revoke all on function public.save_delhivery_shipping_quote(uuid,jsonb,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.save_delhivery_shipping_quote(uuid,jsonb,jsonb,uuid) to service_role;

create or replace function public.claim_order_shipping(p_order_id uuid, p_operation uuid, p_action text,
  p_actor uuid, p_courier_id bigint default null, p_quoted_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare o public.payment_orders; s public.order_shipping; quote jsonb;
begin
  if p_operation is null or p_actor is null then raise exception 'Shipping approval identity required.'; end if;
  select * into o from public.payment_orders where id=p_order_id for update;
  if not found or not o.is_live_checkout or o.is_test_checkout or o.status<>'paid'
    or o.fulfilment_status not in ('confirmed','processing') then
    raise exception 'Only paid, unshipped live orders can be booked.';
  end if;
  insert into public.order_shipping(order_id,created_by) values(o.id,p_actor) on conflict do nothing;
  select * into s from public.order_shipping where order_id=o.id for update;
  if s.operation is not null or s.review_required then
    raise exception 'Shipping is running or needs reconciliation with the provider. Do not book again.';
  end if;
  if p_action='book' then
    if s.shipment_id is not null or s.awb is not null or o.tracking_number<>'' then raise exception 'Shipment already exists.'; end if;
    if s.quoted_at is null or s.quoted_at<now()-interval '15 minutes' then
      raise exception 'Courier rates expired. Check rates again.';
    end if;
    if s.quoted_at is distinct from p_quoted_at then raise exception 'Package or rates changed. Refresh shipping before approving.'; end if;
    select value into quote from jsonb_array_elements(s.quotes) where (value->>'id')::bigint=p_courier_id;
    if quote is null then raise exception 'Select an available quoted courier.'; end if;
  elsif p_action='pickup' then
    if s.provider='delhivery' then raise exception 'Request warehouse pickup in Delhivery One.'; end if;
    if s.awb is null or s.pickup_requested then raise exception 'Pickup requires an AWB and must not already be requested.'; end if;
  else raise exception 'Invalid shipping action.';
  end if;
  update public.order_shipping set operation=p_operation,operation_started_at=now(),updated_at=now(),
    courier_id=case when p_action='book' then p_courier_id else courier_id end,
    courier_name=case when p_action='book' then quote->>'name' else courier_name end,
    approved_charge=case when p_action='book' then (quote->>'charge')::numeric else approved_charge end,
    approved_at=case when p_action='book' then now() else approved_at end,
    approved_by=case when p_action='book' then p_actor else approved_by end
    where order_id=o.id returning * into s;
  return to_jsonb(s);
end $$;

create or replace function public.sync_order_shipping(p_order_id uuid, p_status text)
returns void language plpgsql security definer set search_path=''
as $$
declare s public.order_shipping; o public.payment_orders; next_status text;
begin
  select * into o from public.payment_orders where id=p_order_id for update;
  select * into s from public.order_shipping where order_id=p_order_id;
  if not found or s.awb is null or o.status<>'paid' or not o.is_live_checkout or o.is_test_checkout then
    raise exception 'Paid shipment not found.';
  end if;
  next_status:=case when p_status='DELIVERED' then 'delivered'
    when p_status in ('PICKED UP','SHIPPED','IN TRANSIT','OUT FOR DELIVERY') then 'shipped'
    else o.fulfilment_status end;
  if o.fulfilment_status='delivered' then next_status:='delivered'; end if;
  if o.fulfilment_status='shipped' and next_status not in ('shipped','delivered') then next_status:='shipped'; end if;
  update public.payment_orders set fulfilment_status=next_status,
    courier_name=case when next_status in ('shipped','delivered') then s.courier_name else courier_name end,
    tracking_number=case when next_status in ('shipped','delivered') then s.awb else tracking_number end,
    tracking_url=case when next_status in ('shipped','delivered')
      then case when s.provider='delhivery' then 'https://www.delhivery.com/tracking'
        else 'https://shiprocket.co/tracking/'||s.awb end else tracking_url end,
    fulfilment_updated_at=case when fulfilment_status<>next_status then now() else fulfilment_updated_at end
    where id=o.id;
  update public.order_shipping set tracking_status=p_status,synced_at=now(),tracking_checked_at=now(),
    tracking_error=null,updated_at=now() where order_id=o.id;
end $$;
