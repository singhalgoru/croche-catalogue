begin;
create temporary table history_fixture as select gen_random_uuid() as owner_id,
  gen_random_uuid() as other_id, gen_random_uuid() as admin_id, gen_random_uuid() as cart_id;
grant select on history_fixture to authenticated;
insert into auth.users(id, email, email_confirmed_at, is_anonymous)
select owner_id, 'history-' || owner_id || '@example.invalid', now(), false from history_fixture
union all select other_id, 'history-' || other_id || '@example.invalid', now(), false from history_fixture
union all select admin_id, 'history-' || admin_id || '@example.invalid', now(), false from history_fixture;
insert into public.carts(id, user_id) select cart_id, owner_id from history_fixture;
insert into public.payment_orders(
  reference, request_key, cart_id, created_by, customer_name, customer_contact, customer_email,
  subtotal_paise, shipping_paise, discount_paise, total_paise, status, razorpay_link_id, payment_url, expires_at
)
select 'HISTORY-' || gen_random_uuid(), gen_random_uuid(), cart_id, admin_id, 'Buyer', '+919876543210', null,
  50000, 10000, 5000, 55000, 'link_created', 'plink_' || gen_random_uuid(), 'https://example.invalid/pay', now() + interval '1 day'
from history_fixture;
insert into public.payment_order_items(
  order_id, product_id, variant_id, product_name, variant_name, image_url, unit_price_paise, quantity
)
select o.id, gen_random_uuid(), gen_random_uuid(), 'Saved Rose Charm', 'Pink',
  'https://example.invalid/image.jpg', 25000, 2 from public.payment_orders o
where o.cart_id = (select cart_id from history_fixture);
insert into public.payment_orders(
  reference, request_key, created_by, customer_name, customer_contact, customer_email,
  subtotal_paise, shipping_paise, total_paise, status, razorpay_link_id, payment_url, expires_at
)
select 'HISTORY-' || gen_random_uuid(), gen_random_uuid(), admin_id, 'Email Buyer', '+919876543210',
  upper('history-' || owner_id || '@example.invalid'),
  50000, 0, 50000, 'link_created', 'plink_' || gen_random_uuid(), 'https://example.invalid/pay', now() + interval '1 day'
from history_fixture;
insert into public.payment_orders(
  reference, request_key, created_by, customer_name, customer_contact, customer_email,
  subtotal_paise, shipping_paise, total_paise, status, razorpay_link_id, payment_url, expires_at
)
select 'HISTORY-' || gen_random_uuid(), gen_random_uuid(), admin_id, 'Other Buyer', '+919876543210',
  'history-' || other_id || '@example.invalid',
  50000, 0, 50000, 'link_created', 'plink_' || gen_random_uuid(), 'https://example.invalid/pay', now() + interval '1 day'
from history_fixture;
insert into public.payment_orders(
  reference, request_key, created_by, customer_name, customer_contact, customer_email,
  subtotal_paise, shipping_paise, total_paise, status, is_test_checkout, expires_at
)
select 'HISTORY-TEST-' || gen_random_uuid(), gen_random_uuid(), owner_id, 'Test Buyer', '+919876543210',
  'history-' || owner_id || '@example.invalid',
  50000, 0, 50000, 'creating_checkout', true, now() + interval '1 day' from history_fixture;
select set_config('request.jwt.claims', json_build_object('sub', (select owner_id from history_fixture),
  'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare orders jsonb;
begin
  orders := public.get_customer_orders();
  if jsonb_array_length(orders) <> 2 then raise exception 'FAIL: owner or verified-email order access.'; end if;
  if not exists(select 1 from jsonb_array_elements(orders) o where
    (o->>'total')::numeric = 550 and
    (o->>'discount')::numeric = 50 and o->'items'->0->>'productName' = 'Saved Rose Charm') then
    raise exception 'FAIL: saved order items and totals.';
  end if;
  if exists(select 1 from jsonb_array_elements(orders) o where o ? 'payment_url' or o ? 'razorpay_payment_id') then
    raise exception 'FAIL: internal payment data exposed.';
  end if;
  if jsonb_array_length(public.get_customer_orders(20)) <> 0 then raise exception 'FAIL: pagination.'; end if;
end;
$$;
reset role;
delete from public.carts where id = (select cart_id from history_fixture);
set local role authenticated;
do $$ begin
  if jsonb_array_length(public.get_customer_orders()) <> 2 then raise exception 'FAIL: expired cart removed order history.'; end if;
end $$;
reset role;
select set_config('request.jwt.claims', json_build_object('sub', (select other_id from history_fixture),
  'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  if jsonb_array_length(public.get_customer_orders()) <> 1 then raise exception 'FAIL: another customer order leaked.'; end if;
end $$;
reset role;
select set_config('request.jwt.claims', json_build_object('sub', (select admin_id from history_fixture),
  'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  if jsonb_array_length(public.get_customer_orders()) <> 0 then raise exception 'FAIL: issuer treated as customer.'; end if;
end $$;
reset role;
update auth.users set email_confirmed_at = null where id = (select owner_id from history_fixture);
select set_config('request.jwt.claims', json_build_object('sub', (select owner_id from history_fixture),
  'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare rejected boolean := false;
begin
  begin perform public.get_customer_orders(); exception when others then rejected := true; end;
  if not rejected then raise exception 'FAIL: unverified account access.'; end if;
end;
$$;
reset role;
update auth.users set email_confirmed_at = now() where id = (select owner_id from history_fixture);
update auth.users set email_confirmed_at = null, is_anonymous = true where id = (select other_id from history_fixture);
insert into public.customer_profiles(user_id, email, details)
select owner_id, 'history-' || owner_id || '@example.invalid',
  '{"name":"Buyer","phone":"9876543210","city":"Delhi","pincode":"110001"}'::jsonb from history_fixture;
insert into public.pending_customer_signups(user_id, email, details)
select other_id, 'history-' || other_id || '@example.invalid',
  '{"name":"Pending Buyer","phone":"9876543211","city":"Delhi","pincode":"110001"}'::jsonb from history_fixture;
insert into public.customer_welcome_emails(user_id, sent_at) select owner_id, now() from history_fixture;
insert into public.catalogue_admins(user_id) select admin_id from history_fixture;
set local role authenticated;
do $$
declare rejected boolean := false;
begin
  begin perform public.get_admin_customer_summary(); exception when others then rejected := true; end;
  if not rejected then raise exception 'FAIL: customer can view admin summary.'; end if;
end;
$$;
reset role;
select set_config('request.jwt.claims', json_build_object('sub', (select admin_id from history_fixture),
  'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare summary jsonb; owner_summary jsonb; pending_summary jsonb;
begin
  summary := public.get_admin_customer_summary();
  select c into owner_summary from jsonb_array_elements(summary->'customers') c
    where c->>'id' = (select owner_id::text from history_fixture);
  select c into pending_summary from jsonb_array_elements(summary->'customers') c
    where c->>'id' = (select other_id::text from history_fixture);
  if owner_summary is null or owner_summary->>'verified' <> 'true' or owner_summary->>'welcomeStatus' <> 'sent' then
    raise exception 'FAIL: verified customer summary.';
  end if;
  if pending_summary is null or pending_summary->>'verified' <> 'false' then raise exception 'FAIL: pending activation summary.'; end if;
  if (summary->>'verified')::integer < 1 or (summary->>'pendingActivation')::integer < 1 then raise exception 'FAIL: summary counts.'; end if;
end;
$$;
rollback;
