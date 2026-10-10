begin;
create temporary table webhook_fixture as
select gen_random_uuid() as owner_id,gen_random_uuid() as request_id;
grant select on webhook_fixture to service_role,authenticated;
insert into auth.users(id) select owner_id from webhook_fixture;
select set_config('request.jwt.claims',json_build_object(
  'sub',(select owner_id from webhook_fixture),'role','service_role')::text,true);
set local role service_role;
insert into public.payment_orders(reference,request_key,created_by,customer_name,customer_contact,
  subtotal_paise,shipping_paise,total_paise,status,is_test_checkout,razorpay_order_id,expires_at)
select 'TEST-WEBHOOK-'||request_id::text,request_id,owner_id,'Webhook Buyer','+919876543210',
  10000,0,10000,'checkout_created',true,'order_webhookfixture',now()+interval '1 day' from webhook_fixture;
do $$
declare result jsonb; rejected boolean; stock_before bigint;
begin
  select sum(available_quantity) into stock_before from public.product_variants;
  result:=public.record_razorpay_checkout_event('evt_unknown','payment.captured','order_missing','pay_webhookfixture',10000,'INR');
  if result->>'reason'<>'unknown_checkout_order'
    or exists(select 1 from public.payment_webhook_events where event_id='evt_unknown') then
    raise exception 'FAIL: unknown order was acknowledged permanently.';
  end if;
  rejected:=false;
  begin perform public.record_razorpay_checkout_event('evt_amount','payment.captured','order_webhookfixture','pay_webhookfixture',9999,'INR');
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'FAIL: mismatched amount accepted.'; end if;
  rejected:=false;
  begin perform public.record_razorpay_checkout_event('evt_currency','payment.captured','order_webhookfixture','pay_webhookfixture',10000,'USD');
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'FAIL: mismatched currency accepted.'; end if;
  result:=public.record_razorpay_checkout_event('evt_captured','payment.captured','order_webhookfixture','pay_webhookfixture',10000,'INR');
  if result->>'status'<>'test_verified' then raise exception 'FAIL: webhook did not verify checkout.'; end if;
  perform public.verify_test_checkout((select id from public.payment_orders where razorpay_order_id='order_webhookfixture'),
    (select owner_id from webhook_fixture),'pay_webhookfixture');
  result:=public.record_razorpay_checkout_event('evt_captured','payment.captured','order_webhookfixture','pay_webhookfixture',10000,'INR');
  if result->>'duplicate'<>'true' then raise exception 'FAIL: duplicate event.'; end if;
  perform public.record_razorpay_checkout_event('evt_orderpaid','order.paid','order_webhookfixture','pay_webhookfixture',10000,'INR');
  rejected:=false;
  begin perform public.record_razorpay_checkout_event('evt_other','order.paid','order_webhookfixture','pay_other',10000,'INR');
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'FAIL: different payment overwrote verification.'; end if;
  if (select sum(available_quantity) from public.product_variants) is distinct from stock_before
    or exists(select 1 from public.payment_orders where razorpay_order_id='order_webhookfixture' and paid_at is not null) then
    raise exception 'FAIL: test webhook created real sale or changed stock.';
  end if;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object(
  'sub',(select owner_id from webhook_fixture),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare rejected boolean:=false; begin
  begin perform public.record_razorpay_checkout_event('evt_shopper','order.paid','order_webhookfixture','pay_webhookfixture',10000,'INR');
  exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'FAIL: shopper can settle webhook.'; end if;
end $$;
reset role;
rollback;
