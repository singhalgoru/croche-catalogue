-- Fixtures and all test payments are rolled back.
begin;
create temporary table checkout_fixture as
select gen_random_uuid() as owner_id, gen_random_uuid() as other_id,
  gen_random_uuid() as cart_id, gen_random_uuid() as request_id,
  p.id as product_id, v.id as variant_id, v.available_quantity
from public.products p join public.product_variants v on v.product_id = p.id
where p.published and p.show_price and v.in_stock and v.available_quantity >= 2 limit 1;
grant select on checkout_fixture to authenticated, service_role;
do $$ begin
  if not exists (select 1 from checkout_fixture) then raise exception 'A variant with two available items is required.'; end if;
end $$;
insert into auth.users(id) select owner_id from checkout_fixture union all select other_id from checkout_fixture;
select set_config('request.jwt.claims', json_build_object(
  'sub', (select owner_id from checkout_fixture), 'role', 'service_role')::text, true);
set local role service_role;
update public.products set minimum_order_quantity = 1 where id = (select product_id from checkout_fixture);
update public.product_variants set price = 50 where id = (select variant_id from checkout_fixture);
insert into public.carts(id, user_id, delivery_pin_code, delivery_estimate)
select cart_id, owner_id, '110001', '{"itemCount":2,"minCharge":66}'::jsonb from checkout_fixture;
insert into public.cart_items(cart_id, product_id, variant_id, product_name, variant_name, image_url, unit_price, quantity)
select cart_id, product_id::text, variant_id::text, 'Forged name', 'Forged variant', 'https://example.invalid/fake', 1, 2 from checkout_fixture;
do $$
declare f record; prepared public.payment_orders; reused public.payment_orders; rejected boolean;
begin
  select * into f from checkout_fixture;
  prepared := public.prepare_checkout_payment(f.cart_id, f.owner_id, f.request_id, 'Test Buyer', '+919876543210');
  if prepared.total_paise <> 17000 or prepared.subtotal_paise <> 10000 or prepared.shipping_paise <> 7000
    or not prepared.is_test_checkout or prepared.status <> 'creating_checkout' then
    raise exception 'FAIL: authoritative price/shipping/test status.';
  end if;
  if not exists (select 1 from public.payment_order_items where order_id = prepared.id and unit_price_paise = 5000
    and quantity = 2 and product_name <> 'Forged name') then raise exception 'FAIL: immutable snapshot.'; end if;
  reused := public.prepare_checkout_payment(f.cart_id, f.owner_id, f.request_id, 'Test Buyer', '+919876543210');
  if reused.id <> prepared.id then raise exception 'FAIL: duplicate order.'; end if;
  rejected := false;
  begin
    perform public.prepare_checkout_payment(f.cart_id, f.other_id, gen_random_uuid(), 'Test Buyer', '+919876543210');
  exception when others then rejected := true; end;
  if not rejected then raise exception 'FAIL: unowned cart accepted.'; end if;
  insert into public.cart_session_blocks(user_id) values (f.owner_id);
  rejected := false;
  begin
    perform public.prepare_checkout_payment(f.cart_id, f.owner_id, gen_random_uuid(), 'Test Buyer', '+919876543210');
  exception when others then rejected := true; end;
  if not rejected then raise exception 'FAIL: blocked shopper accepted.'; end if;
  delete from public.cart_session_blocks where user_id = f.owner_id;
  update public.payment_orders set status = 'checkout_created', razorpay_order_id = 'order_fixture' where id = prepared.id;
  perform public.verify_test_checkout(prepared.id, f.owner_id, 'pay_fixture');
  perform public.verify_test_checkout(prepared.id, f.owner_id, 'pay_fixture');
  if (select status from public.payment_orders where id = prepared.id) <> 'test_verified'
    or (select available_quantity from public.product_variants where id = f.variant_id) <> f.available_quantity then
    raise exception 'FAIL: test payment changed stock or verification is not idempotent.';
  end if;
  rejected := false;
  begin perform public.verify_test_checkout(prepared.id, f.owner_id, 'pay_other');
  exception when others then rejected := true; end;
  if not rejected then raise exception 'FAIL: second payment overwrote verification.'; end if;
  update public.products set minimum_order_quantity = 3 where id = f.product_id;
  rejected := false;
  begin perform public.prepare_checkout_payment(f.cart_id, f.owner_id, gen_random_uuid(), 'Test Buyer', '+919876543210');
  exception when others then rejected := true; end;
  if not rejected then raise exception 'FAIL: below-minimum quantity accepted.'; end if;
  update public.products set minimum_order_quantity = 1 where id = f.product_id;
  update public.product_variants set available_quantity = 0, in_stock = false where id = f.variant_id;
  rejected := false;
  begin perform public.prepare_checkout_payment(f.cart_id, f.owner_id, gen_random_uuid(), 'Test Buyer', '+919876543210');
  exception when others then rejected := true; end;
  if not rejected then raise exception 'FAIL: unavailable inventory accepted.'; end if;
  update public.product_variants set available_quantity = f.available_quantity, in_stock = true where id = f.variant_id;
  update public.products set show_price = false where id = f.product_id;
  rejected := false;
  begin perform public.prepare_checkout_payment(f.cart_id, f.owner_id, gen_random_uuid(), 'Test Buyer', '+919876543210');
  exception when others then rejected := true; end;
  if not rejected then raise exception 'FAIL: hidden price accepted.'; end if;
  raise notice 'PASS: authoritative totals, snapshots, ownership, blocking, minimum quantity, inventory and idempotent test verification.';
end $$;
reset role;
select set_config('request.jwt.claims', json_build_object(
  'sub', (select other_id from checkout_fixture), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  if exists (select 1 from public.payment_orders) then raise exception 'FAIL: shopper can read another owner''s orders.'; end if;
end $$;
reset role;
select set_config('request.jwt.claims', json_build_object(
  'sub', (select owner_id from checkout_fixture), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  if (select count(*) from public.payment_orders) <> 1 then raise exception 'FAIL: owner cannot read checkout.'; end if;
  if (select count(*) from public.payment_order_items) <> 1 then raise exception 'FAIL: owner cannot read snapshot.'; end if;
  raise notice 'PASS: payment RLS.';
end $$;
reset role;
rollback;
