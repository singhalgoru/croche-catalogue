begin;
create temporary table campaign_fixture as
select gen_random_uuid() as owner_id,gen_random_uuid() as other_id,gen_random_uuid() as admin_id,
  gen_random_uuid() as cart_id,gen_random_uuid() as other_cart_id,
  p.id as product_id,v.id as variant_id
from public.products p join public.product_variants v on v.product_id=p.id
where p.published and p.show_price and v.in_stock and v.available_quantity>=2 limit 1;
grant select on campaign_fixture to authenticated,service_role;
create temporary table generated_coupon(id uuid,code text);
grant all on generated_coupon to authenticated,service_role;
do $$ begin if not exists(select 1 from campaign_fixture) then raise exception 'Available variant required.'; end if; end $$;
insert into auth.users(id,is_anonymous)
select owner_id,true from campaign_fixture union all select other_id,true from campaign_fixture
union all select admin_id,false from campaign_fixture;
insert into public.catalogue_admins(user_id) select admin_id from campaign_fixture;
select set_config('request.jwt.claims',json_build_object('sub',(select admin_id from campaign_fixture),'role','service_role')::text,true);
set local role service_role;
update public.products set minimum_order_quantity=1,published=true,show_price=true where id=(select product_id from campaign_fixture);
update public.product_variants set price=500,available_quantity=5,in_stock=true where id=(select variant_id from campaign_fixture);
insert into public.carts(id,user_id,delivery_pin_code)
select cart_id,owner_id,'110001' from campaign_fixture union all select other_cart_id,other_id,'110001' from campaign_fixture;
insert into public.cart_items(cart_id,product_id,variant_id,product_name,variant_name,image_url,quantity,unit_price)
select c.id,f.product_id::text,f.variant_id::text,'Test product','Variant','https://example.invalid/fake',1,1
from campaign_fixture f join public.carts c on c.id in(f.cart_id,f.other_cart_id);
insert into public.cart_delivery_details(cart_id,details)
select c.id,'{"name":"Test Buyer","phone":"9876543210","email":"","addressLine1":"12 Test Street","addressLine2":"","city":"New Delhi","state":"Delhi","pincode":"110001"}'::jsonb
from campaign_fixture f join public.carts c on c.id in(f.cart_id,f.other_cart_id);
reset role;
select set_config('request.jwt.claims',json_build_object('sub',(select admin_id from campaign_fixture),'role','authenticated')::text,true);
set local role authenticated;
do $$
declare coupon public.campaign_coupons; rejected boolean:=false; requested_expiry timestamptz:=now()+interval '1 hour';
begin
  coupon:=public.generate_campaign_coupon(10,100,500,requested_expiry,1,false);
  if coupon.code !~ '^LUVIA-[A-F0-9]{16}$' or coupon.expires_at<>requested_expiry or coupon.max_redemptions<>1 then
    raise exception 'FAIL: generated code, precise expiry or usage limit.';
  end if;
  insert into generated_coupon values(coupon.id,coupon.code);
  begin perform public.generate_campaign_coupon(10,100,500,now()-interval '1 minute',1,false);
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'FAIL: past expiry accepted.'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',(select owner_id from campaign_fixture),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare rejected boolean:=false; begin
  if exists(select 1 from public.campaign_coupons where id=(select id from generated_coupon)) then
    raise exception 'FAIL: unselected code exposed to customer.';
  end if;
  begin perform public.generate_campaign_coupon(10,100,500,now()+interval '1 day',1,false);
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'FAIL: customer can generate coupon.'; end if;
  perform public.select_cart_coupon((select cart_id from campaign_fixture),(select code from generated_coupon));
  if not exists(select 1 from public.campaign_coupons where id=(select id from generated_coupon)) then
    raise exception 'FAIL: selected code not available to owner.';
  end if;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',(select admin_id from campaign_fixture),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare result jsonb; begin
  result:=public.prepare_payment_link_order((select cart_id from campaign_fixture),gen_random_uuid(),'Test Buyer','+919876543210',null,10000);
  if (result->>'total_paise')::bigint<>55000 or (result->>'discount_paise')::bigint<>5000 then
    raise exception 'FAIL: campaign discount.';
  end if;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',(select other_id from campaign_fixture),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare rejected boolean:=false; begin
  begin perform public.select_cart_coupon((select other_cart_id from campaign_fixture),(select code from generated_coupon));
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'FAIL: pending coupon usage limit bypassed.'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',(select admin_id from campaign_fixture),'role','service_role')::text,true);
set local role service_role;
update public.payment_orders set status='link_created',razorpay_link_id='plink_campaign_test',payment_url='https://rzp.io/i/test'
where campaign_coupon_id=(select id from generated_coupon);
select public.record_razorpay_payment_event('evt_campaign_test','payment_link.expired','plink_campaign_test',null,55000);
update public.campaign_coupons set first_order_only=true where id=(select id from generated_coupon);
reset role;
select set_config('request.jwt.claims',json_build_object('sub',(select other_id from campaign_fixture),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare rejected boolean:=false; begin
  begin perform public.select_cart_coupon((select other_cart_id from campaign_fixture),(select code from generated_coupon));
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'FAIL: first-order code allowed unverified account.'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',(select admin_id from campaign_fixture),'role','service_role')::text,true);
set local role service_role;
update public.campaign_coupons set first_order_only=false,expires_at=now()-interval '1 second' where id=(select id from generated_coupon);
reset role;
select set_config('request.jwt.claims',json_build_object('sub',(select owner_id from campaign_fixture),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare rejected boolean:=false; begin
  begin perform public.select_cart_coupon((select cart_id from campaign_fixture),(select code from generated_coupon));
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'FAIL: expired coupon accepted.'; end if;
  perform public.select_cart_coupon((select cart_id from campaign_fixture),'');
  if exists(select 1 from public.cart_delivery_details where cart_id=(select cart_id from campaign_fixture) and campaign_coupon_id is not null) then
    raise exception 'FAIL: coupon removal.';
  end if;
  raise notice 'PASS: admin-only random generation, exact expiry, private code, first-order verification, reservation cap and removal.';
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',(select admin_id from campaign_fixture),'role','service_role')::text,true);
set local role service_role;
update public.campaign_coupons set expires_at=now()+interval '1 day' where id=(select id from generated_coupon);
reset role;
select set_config('request.jwt.claims',json_build_object('sub',(select other_id from campaign_fixture),'role','authenticated')::text,true);
set local role authenticated;
select public.select_cart_coupon((select other_cart_id from campaign_fixture),(select code from generated_coupon));
reset role;
select set_config('request.jwt.claims',json_build_object('sub',(select admin_id from campaign_fixture),'role','authenticated')::text,true);
set local role authenticated;
select public.redeem_cart_coupon_manually((select other_cart_id from campaign_fixture));
do $$ declare rejected boolean:=false; begin
  begin perform public.redeem_cart_coupon_manually((select other_cart_id from campaign_fixture));
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'FAIL: repeated manual redemption.'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',(select owner_id from campaign_fixture),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare rejected boolean:=false; begin
  begin perform public.select_cart_coupon((select cart_id from campaign_fixture),(select code from generated_coupon));
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'FAIL: offline redemption did not consume usage capacity.'; end if;
  raise notice 'PASS: offline campaign redemption shares the usage limit.';
end $$;
reset role;
rollback;
