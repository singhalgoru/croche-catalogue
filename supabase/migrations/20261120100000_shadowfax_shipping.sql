alter table public.order_shipping drop constraint order_shipping_provider_check;
alter table public.order_shipping add constraint order_shipping_provider_check
  check (provider in ('shiprocket','delhivery','shadowfax'));

create function public.save_shadowfax_shipping_quote(p_order_id uuid, p_package jsonb, p_quotes jsonb, p_actor uuid)
returns void language plpgsql security definer set search_path=''
as $$
begin
  perform public.save_order_shipping_quote(p_order_id,p_package,p_quotes,p_actor);
  update public.order_shipping set provider='shadowfax' where order_id=p_order_id;
end $$;
revoke all on function public.save_shadowfax_shipping_quote(uuid,jsonb,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.save_shadowfax_shipping_quote(uuid,jsonb,jsonb,uuid) to service_role;

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
        when s.provider='shadowfax' then 'https://tracker.shadowfax.in/'
        else 'https://shiprocket.co/tracking/'||s.awb end else tracking_url end,
    fulfilment_updated_at=case when fulfilment_status<>next_status then now() else fulfilment_updated_at end
    where id=o.id;
  update public.order_shipping set tracking_status=p_status,synced_at=now(),tracking_checked_at=now(),
    tracking_error=null,updated_at=now() where order_id=o.id;
end $$;
