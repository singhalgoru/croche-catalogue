-- Run after applying 20261006170000_add_payment_link_orders.sql with:
-- supabase db query --linked --file supabase/tests/payment_link_orders.sql
-- Fixture users, orders, webhook events and inventory changes are rolled back.
begin;

create temporary table payment_order_fixture as
select gen_random_uuid() as customer_id,
  gen_random_uuid() as admin_id,
  gen_random_uuid() as request_key,
  gen_random_uuid() as cart_id,
  p.id as product_id,
  v.id as variant_id,
  v.available_quantity,
  v.price as variant_price,
  p.price as product_price,
  p.show_price,
  p.name as product_name,
  v.name as variant_name,
  p.public_slug,
  v.image_url
from public.products p
join public.product_variants v on v.product_id = p.id
where p.published and p.show_price and p.in_stock and v.in_stock
  and v.available_quantity > 0
  and coalesce(v.price, p.price) > 0
limit 1;
grant select on payment_order_fixture to authenticated, service_role;
create temporary table prepared_payment_order (result jsonb);
grant select, insert on prepared_payment_order to authenticated, service_role;

do $$
begin
  if not exists (select 1 from payment_order_fixture) then
    raise exception 'A published, priced, in-stock product variant is required for payment tests.';
  end if;
end;
$$;

insert into auth.users (id)
select customer_id from payment_order_fixture
union all
select admin_id from payment_order_fixture;

insert into public.catalogue_admins(user_id)
select admin_id from payment_order_fixture;

select set_config('request.jwt.claims', json_build_object(
  'sub', (select admin_id from payment_order_fixture), 'role', 'service_role'
)::text, true);
set local role service_role;
insert into public.carts(id, user_id)
select cart_id, customer_id from payment_order_fixture;
insert into public.cart_items(
  cart_id, product_id, variant_id, product_name, variant_name, image_url, quantity
)
select cart_id, product_id::text, variant_id::text, 'Untrusted name', 'Untrusted variant',
  'https://example.invalid/fake.webp', 1
from payment_order_fixture;
reset role;

select set_config('request.jwt.claims', json_build_object(
  'sub', (select admin_id from payment_order_fixture), 'role', 'authenticated'
)::text, true);
set local role authenticated;

insert into prepared_payment_order
select public.prepare_payment_link_order(
  cart_id, request_key, 'Test Buyer', '+919876543210', null, 2500
) as result
from payment_order_fixture;

do $$
declare
  prepared jsonb;
  reused jsonb;
  duplicate_rejected boolean := false;
begin
  select result into prepared from prepared_payment_order;
  if prepared->>'status' <> 'creating_link'
    or (prepared->>'total_paise')::bigint <>
      ((select coalesce(variant_price, product_price) from payment_order_fixture) * 100 + 2500)
    then
    raise exception 'FAIL: payment amount or prepared order status is incorrect.';
  end if;

  select public.prepare_payment_link_order(
    cart_id, request_key, 'Test Buyer', '+919876543210', null, 2500
  ) into reused from payment_order_fixture;
  if reused->>'id' is distinct from prepared->>'id' or reused->>'reused' <> 'true' then
    raise exception 'FAIL: repeated idempotency key did not reuse the same order.';
  end if;

  begin
    perform public.prepare_payment_link_order(
      cart_id, gen_random_uuid(), 'Test Buyer', '+919876543210', null, 2500
    ) from payment_order_fixture;
  exception when others then
    if SQLERRM not like '%pending payment link%' then raise; end if;
    duplicate_rejected := true;
  end;
  if not duplicate_rejected then
    raise exception 'FAIL: a second active payment link was allowed for one cart.';
  end if;
end;
$$;

reset role;
select set_config('request.jwt.claims', json_build_object(
  'sub', (select admin_id from payment_order_fixture), 'role', 'service_role'
)::text, true);
set local role service_role;

do $$
declare
  prepared jsonb;
  paid jsonb;
  duplicate jsonb;
  target_order uuid;
  link_id text := 'plink_payment_test';
  starting_quantity integer;
begin
  select result into prepared from prepared_payment_order;
  target_order := (prepared->>'id')::uuid;
  select available_quantity into starting_quantity
  from public.product_variants
  where id = (select variant_id from payment_order_fixture);

  update public.payment_orders
  set status = 'link_created', razorpay_link_id = link_id,
      payment_url = 'https://rzp.io/i/payment-test'
  where id = target_order;

  paid := public.record_razorpay_payment_event(
    'evt_payment_test', 'payment_link.paid', link_id, 'pay_payment_test',
    (prepared->>'total_paise')::bigint
  );
  if paid->>'status' <> 'paid' then
    raise exception 'FAIL: verified payment did not mark the order paid.';
  end if;
  if (select available_quantity from public.product_variants
      where id = (select variant_id from payment_order_fixture)) <> starting_quantity - 1 then
    raise exception 'FAIL: paid order did not decrement inventory exactly once.';
  end if;

  duplicate := public.record_razorpay_payment_event(
    'evt_payment_test', 'payment_link.paid', link_id, 'pay_payment_test',
    (prepared->>'total_paise')::bigint
  );
  if duplicate->>'duplicate' <> 'true' then
    raise exception 'FAIL: duplicate webhook event was not ignored.';
  end if;
  if (select available_quantity from public.product_variants
      where id = (select variant_id from payment_order_fixture)) <> starting_quantity - 1 then
    raise exception 'FAIL: duplicate webhook event changed inventory.';
  end if;

  insert into public.payment_orders (
    reference, request_key, created_by, customer_name, customer_contact,
    subtotal_paise, shipping_paise, total_paise, status,
    razorpay_link_id, payment_url, expires_at
  ) values (
    'LUV-MISMATCH01', gen_random_uuid(),
    (select admin_id from payment_order_fixture), 'Test Buyer', '+919876543210',
    5000, 0, 5000, 'link_created',
    'plink_mismatch_test', 'https://rzp.io/i/mismatch-test', now() + interval '1 day'
  ) returning id into target_order;
  insert into public.payment_order_items (
    order_id, product_id, variant_id, product_name, variant_name, image_url,
    unit_price_paise, quantity
  )
  select target_order, product_id, variant_id, product_name, variant_name,
    image_url, coalesce(variant_price, product_price) * 100, 1
  from payment_order_fixture;

  paid := public.record_razorpay_payment_event(
    'evt_payment_mismatch', 'payment_link.paid', 'plink_mismatch_test',
    'pay_payment_mismatch', 100
  );
  if paid->>'status' <> 'review_required'
    or (select status from public.payment_orders where id = target_order) <> 'review_required' then
    raise exception 'FAIL: mismatched captured amount was not marked for review.';
  end if;
  if (select available_quantity from public.product_variants
      where id = (select variant_id from payment_order_fixture)) <> starting_quantity - 1 then
    raise exception 'FAIL: mismatched payment changed inventory.';
  end if;
end;
$$;

rollback;
