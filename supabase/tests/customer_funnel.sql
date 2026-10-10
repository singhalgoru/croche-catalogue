-- Test users, addresses, coupons, orders and inventory changes are rolled back.
begin;
create temporary table customer_fixture as
select gen_random_uuid() as owner_id, gen_random_uuid() as other_id, gen_random_uuid() as admin_id,
  gen_random_uuid() as cart_id, gen_random_uuid() as request_id,
  'test-' || gen_random_uuid()::text || '@example.invalid' as email,
  p.id as product_id, v.id as variant_id
from public.products p join public.product_variants v on v.product_id = p.id
where p.published and p.show_price and v.in_stock and v.available_quantity >= 2 limit 1;
grant select on customer_fixture to authenticated, service_role;
create temporary table coupon_fixture(id uuid,code text);
grant all on coupon_fixture to authenticated,service_role;
create temporary table order_fixture(result jsonb);
grant all on order_fixture to authenticated,service_role;
do $$ begin
  if not exists(select 1 from customer_fixture) then raise exception 'An available variant is required.'; end if;
end $$;
insert into auth.users(id,email,email_confirmed_at,is_anonymous)
select owner_id,email,now(),false from customer_fixture;
insert into auth.users(id,is_anonymous)
select other_id,true from customer_fixture union all select admin_id,false from customer_fixture;
insert into public.catalogue_admins(user_id) select admin_id from customer_fixture;
select set_config('request.jwt.claims',json_build_object(
  'sub',(select owner_id from customer_fixture),'role','service_role')::text,true);
set local role service_role;
update public.products set minimum_order_quantity=1,show_price=true,published=true
where id=(select product_id from customer_fixture);
update public.product_variants set price=500,available_quantity=5,in_stock=true
where id=(select variant_id from customer_fixture);
insert into public.carts(id,user_id,delivery_pin_code) select cart_id,owner_id,'110001' from customer_fixture;
insert into public.cart_items(cart_id,product_id,variant_id,product_name,variant_name,image_url,quantity,unit_price)
select cart_id,product_id::text,variant_id::text,'Forged name','Forged variant','https://example.invalid/fake',1,1 from customer_fixture;
do $$
declare rejected boolean:=false; f record; coupon public.welcome_coupons; repeat_coupon public.welcome_coupons;
begin
  select * into f from customer_fixture;
  begin perform public.claim_welcome_coupon(f.owner_id); exception when others then rejected:=true; end;
  if not rejected then raise exception 'FAIL: disabled offer claimed.'; end if;
  update public.welcome_offer set enabled=true,percent=10,max_discount_rupees=100,minimum_subtotal_rupees=500;
  rejected:=false;
  begin perform public.claim_welcome_coupon(f.other_id); exception when others then rejected:=true; end;
  if not rejected then raise exception 'FAIL: unverified email claimed coupon.'; end if;
  coupon:=public.claim_welcome_coupon(f.owner_id);
  repeat_coupon:=public.claim_welcome_coupon(f.owner_id);
  if coupon.id<>repeat_coupon.id or coupon.percent<>10 or coupon.code<>'ILOVELUVIA' then
    raise exception 'FAIL: coupon idempotency, name or terms.';
  end if;
  insert into coupon_fixture values(coupon.id,coupon.code);
end $$;
reset role;
update auth.users set email=upper(email) where id=(select owner_id from customer_fixture);
set local role service_role;
do $$
declare repeated public.welcome_coupons;
begin
  repeated:=public.claim_welcome_coupon((select owner_id from customer_fixture));
  if repeated.id<>(select id from coupon_fixture) then raise exception 'FAIL: email casing reset coupon eligibility.'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object(
  'sub',(select owner_id from customer_fixture),'role','authenticated')::text,true);
set local role authenticated;
do $$
declare f record; saved jsonb; rejected boolean; address jsonb;
begin
  select * into f from customer_fixture;
  address:=jsonb_build_object('name',' Test Buyer ','phone','9876543210','email',f.email,
    'addressLine1',' 12 Test Street ','addressLine2','','city','New Delhi','state','Delhi','pincode','110001');
  saved:=public.save_cart_delivery_details(f.cart_id,address);
  if saved->>'name'<>'Test Buyer' or saved->>'addressLine1'<>'12 Test Street' then raise exception 'FAIL: address normalization.'; end if;
  if (select delivery_pin_code from public.carts where id=f.cart_id)<>'110001' then raise exception 'FAIL: cart pincode out of sync.'; end if;
  rejected:=false;
  begin perform public.save_cart_delivery_details(f.cart_id,address||'{"phone":"123"}'::jsonb);
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'FAIL: invalid phone accepted.'; end if;
  rejected:=false;
  begin perform public.save_cart_delivery_details(f.cart_id,address||'{"pincode":"000000"}'::jsonb);
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'FAIL: invalid pincode accepted.'; end if;
  perform public.select_cart_coupon(f.cart_id,'iloveluvia');
  if (select welcome_coupon_id from public.cart_delivery_details where cart_id=f.cart_id)<>(select id from coupon_fixture) then
    raise exception 'FAIL: coupon selection.';
  end if;
  update public.welcome_offer set percent=50;
  if (select percent from public.welcome_offer)<>10 then raise exception 'FAIL: shopper can change offer.'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object(
  'sub',(select other_id from customer_fixture),'role','authenticated')::text,true);
set local role authenticated;
do $$
declare rejected boolean:=false;
begin
  if exists(select 1 from public.cart_delivery_details) or exists(select 1 from public.welcome_coupons) then
    raise exception 'FAIL: another shopper can read private address/coupon.';
  end if;
  begin perform public.save_cart_delivery_details((select cart_id from customer_fixture),'{}'::jsonb);
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'FAIL: another shopper can change address.'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object(
  'sub',(select admin_id from customer_fixture),'role','authenticated')::text,true);
set local role authenticated;
do $$
declare rejected boolean:=false; f record;
begin
  select * into f from customer_fixture;
  if (select count(*) from public.cart_delivery_details where cart_id=(select cart_id from customer_fixture))<>1 then
    raise exception 'FAIL: admin cannot read address.';
  end if;
  begin perform public.prepare_payment_link_order(f.cart_id,f.request_id,'Test Buyer','+919876543210','different@example.invalid',2500);
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'FAIL: mismatched coupon email accepted.'; end if;
  insert into order_fixture select public.prepare_payment_link_order(f.cart_id,f.request_id,'Test Buyer','+919876543210',f.email,2500);
  if (select (result->>'total_paise')::bigint from order_fixture)<>47500 then raise exception 'FAIL: discount total.'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object(
  'sub',(select admin_id from customer_fixture),'role','service_role')::text,true);
set local role service_role;
do $$
declare order_id uuid; result jsonb; rejected boolean:=false;
begin
  select (o.result->>'id')::uuid into order_id from order_fixture o;
  update public.payment_orders set status='link_created',razorpay_link_id='plink_customer_fixture',
    payment_url='https://rzp.io/i/fixture' where id=order_id;
  result:=public.record_razorpay_payment_event('evt_customer_fixture','payment_link.paid','plink_customer_fixture','pay_customer_fixture',47500);
  if result->>'status'<>'paid' then raise exception 'FAIL: discounted payment not settled.'; end if;
  perform public.record_razorpay_payment_event('evt_customer_fixture','payment_link.paid','plink_customer_fixture','pay_customer_fixture',47500);
  if (select available_quantity from public.product_variants where id=(select variant_id from customer_fixture))<>4 then
    raise exception 'FAIL: duplicate stock deduction.';
  end if;
  if (select redeemed_order_id from public.welcome_coupons where id=(select id from coupon_fixture))<>order_id then
    raise exception 'FAIL: coupon not redeemed on paid webhook.';
  end if;
  begin perform public.claim_welcome_coupon((select owner_id from customer_fixture));
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'FAIL: returning customer claimed first-order coupon.'; end if;
  raise notice 'PASS: private addresses, validation, verified-email coupon, admin-only configuration, discount and idempotent redemption.';
end $$;
reset role;
create temporary table manual_customer_fixture as
select gen_random_uuid() as owner_id,gen_random_uuid() as cart_id,
  'manual-'||gen_random_uuid()::text||'@example.invalid' as email;
grant select on manual_customer_fixture to authenticated,service_role;
insert into auth.users(id,email,email_confirmed_at,is_anonymous)
select owner_id,email,now(),false from manual_customer_fixture;
select set_config('request.jwt.claims',json_build_object(
  'sub',(select owner_id from manual_customer_fixture),'role','service_role')::text,true);
set local role service_role;
insert into public.carts(id,user_id,delivery_pin_code) select cart_id,owner_id,'110001' from manual_customer_fixture;
insert into public.cart_items(cart_id,product_id,variant_id,product_name,variant_name,image_url,quantity)
select m.cart_id,f.product_id::text,f.variant_id::text,'Test product','Variant','https://example.invalid/fake',1
from manual_customer_fixture m cross join customer_fixture f;
reset role;
select set_config('request.jwt.claims',json_build_object(
  'sub',(select owner_id from manual_customer_fixture),'role','authenticated')::text,true);
set local role authenticated;
select public.save_cart_delivery_details((select cart_id from manual_customer_fixture),
  jsonb_build_object('name','Manual Buyer','phone','9876543210','email','',
    'addressLine1','12 Test Street','addressLine2','','city','New Delhi','state','Delhi','pincode','110001'));
select public.select_cart_coupon((select cart_id from manual_customer_fixture),'iloveluvia');
do $$ declare rejected boolean:=false; begin
  begin perform public.redeem_cart_coupon_manually((select cart_id from manual_customer_fixture));
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'FAIL: shopper can claim a paid offline order.'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object(
  'sub',(select admin_id from customer_fixture),'role','authenticated')::text,true);
set local role authenticated;
select public.redeem_cart_coupon_manually((select cart_id from manual_customer_fixture));
reset role;
select set_config('request.jwt.claims',json_build_object(
  'sub',(select owner_id from manual_customer_fixture),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare rejected boolean:=false; begin
  begin perform public.select_cart_coupon((select cart_id from manual_customer_fixture),'ILOVELUVIA');
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'FAIL: same email reused ILOVELUVIA after an offline redemption.'; end if;
  raise notice 'PASS: ILOVELUVIA is single-use per email for offline orders too.';
end $$;
reset role;
rollback;
