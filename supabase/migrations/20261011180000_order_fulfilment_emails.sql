alter table public.order_confirmation_emails
  add column kind text not null default 'confirmed'
    check(kind in ('confirmed','shipped','delivered')),
  add column fulfilment_details jsonb;
alter table public.order_confirmation_emails
  drop constraint order_confirmation_emails_order_id_audience_key,
  add constraint order_email_event_unique unique(order_id,audience,kind),
  add constraint fulfilment_email_details_check check(
    kind='confirmed' or (audience='customer' and fulfilment_details is not null
      and jsonb_typeof(fulfilment_details)='object'));

create function public.enqueue_order_fulfilment_email()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.is_live_checkout and not new.is_test_checkout and new.status='paid'
    and new.fulfilment_status in ('shipped','delivered')
    and new.fulfilment_status is distinct from old.fulfilment_status then
    if nullif(btrim(new.customer_email),'') is null then
      raise exception 'Save a customer email before sending shipment or delivery updates.';
    end if;
    insert into public.order_confirmation_emails(order_id,audience,recipient,kind,fulfilment_details)
    values(new.id,'customer',new.customer_email,new.fulfilment_status,jsonb_build_object(
      'courier_name',new.courier_name,'tracking_number',new.tracking_number,
      'tracking_url',new.tracking_url,'updated_at',new.fulfilment_updated_at))
    on conflict(order_id,audience,kind) do nothing;
  end if;
  return new;
end $$;
revoke all on function public.enqueue_order_fulfilment_email() from public,anon,authenticated;
create trigger enqueue_order_fulfilment_email after update of fulfilment_status on public.payment_orders
for each row execute function public.enqueue_order_fulfilment_email();
