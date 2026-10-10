-- Checkout is still test-only. Reconciliation must not settle real inventory.
create function public.record_razorpay_checkout_event(
  p_event_id text, p_event_name text, p_order_id text,
  p_payment_id text, p_amount_paise bigint, p_currency text
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare target public.payment_orders;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Backend access required.'; end if;
  if p_event_id is null or p_event_id !~ '^[A-Za-z0-9._:-]{1,200}$'
    or p_event_name is null or p_event_name not in ('payment.captured','order.paid')
    or p_order_id is null or p_order_id !~ '^order_[A-Za-z0-9]+$'
    or p_payment_id is null or p_payment_id !~ '^pay_[A-Za-z0-9]+$'
    or p_amount_paise is null or p_amount_paise < 100 or p_currency is null then
    raise exception 'Invalid captured checkout event.';
  end if;
  select * into target from public.payment_orders where razorpay_order_id=p_order_id for update;
  if not found then return jsonb_build_object('processed',false,'reason','unknown_checkout_order'); end if;
  if not target.is_test_checkout then raise exception 'Live checkout settlement is not enabled.'; end if;
  if target.total_paise <> p_amount_paise or target.currency <> p_currency then
    raise exception 'Captured payment does not match the stored amount and currency.';
  end if;
  if target.status = 'test_verified' then
    if target.razorpay_payment_id is distinct from p_payment_id then
      raise exception 'Checkout already has a different verified payment.';
    end if;
  elsif target.status <> 'checkout_created' then
    raise exception 'Checkout is not ready for reconciliation.';
  end if;
  insert into public.payment_webhook_events(event_id,event_name)
  values(p_event_id,p_event_name) on conflict(event_id) do nothing;
  if not found then return jsonb_build_object('processed',false,'duplicate',true); end if;
  -- Provider settlement must be recorded even if the customer's session is blocked.
  update public.payment_orders set status='test_verified',razorpay_payment_id=p_payment_id
  where id=target.id;
  return jsonb_build_object('processed',true,'status','test_verified','test_mode',true);
end $$;
revoke all on function public.record_razorpay_checkout_event(text,text,text,text,bigint,text)
from public,anon,authenticated;
grant execute on function public.record_razorpay_checkout_event(text,text,text,text,bigint,text) to service_role;
