begin;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
create temporary table live_fixture as
select gen_random_uuid() as owner_id,gen_random_uuid() as other_id,gen_random_uuid() as cart_id,
  gen_random_uuid() as other_cart_id,gen_random_uuid() as request_id,p.id as product_id,v.id as variant_id
from public.products p join public.product_variants v on v.product_id=p.id limit 1;
grant all on live_fixture to authenticated,service_role;
create temporary table live_order(id uuid);
grant all on live_order to authenticated,service_role;
insert into auth.users(id,email,email_confirmed_at,is_anonymous)
select owner_id,'live-'||owner_id||'@example.invalid',now(),false from live_fixture
union all select other_id,'live-'||other_id||'@example.invalid',now(),false from live_fixture;
insert into public.carts(id,user_id,delivery_pin_code)
select cart_id,owner_id,'110001' from live_fixture union all select other_cart_id,other_id,'110001' from live_fixture;
insert into public.cart_items(cart_id,product_id,variant_id,product_name,variant_name,image_url,quantity,unit_price)
select cart_id,product_id::text,variant_id::text,'Untrusted snapshot','Test variant','',1,1 from live_fixture
union all select other_cart_id,product_id::text,variant_id::text,'Untrusted snapshot','Test variant','',1,1 from live_fixture;
insert into public.cart_delivery_details(cart_id,details)
select cart_id,jsonb_build_object('name','Live Buyer','phone','9876543210','email','live-'||owner_id||'@example.invalid',
  'addressLine1','12 Test Street','addressLine2','','city','Delhi','state','Delhi','pincode','110001') from live_fixture
union all select other_cart_id,jsonb_build_object('name','Other Buyer','phone','9876543210','email','live-'||other_id||'@example.invalid',
  'addressLine1','12 Test Street','addressLine2','','city','Delhi','state','Delhi','pincode','110001') from live_fixture;
update public.products set published=true,show_price=true,minimum_order_quantity=1 where id=(select product_id from live_fixture);
update public.product_variants set price=500,available_quantity=1,in_stock=true where id=(select variant_id from live_fixture);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
do $$
declare f record; previous public.payment_orders; replacement public.payment_orders; key uuid:=gen_random_uuid(); rejected boolean:=false; result jsonb;
begin
  select * into f from live_fixture;
  update public.checkout_settings set live_enabled=true;
  update public.product_variants set available_quantity=3 where id=f.variant_id;
  previous:=public.prepare_live_checkout(f.other_cart_id,f.other_id,gen_random_uuid());
  update public.payment_orders set status='link_created',razorpay_order_id='order_replacefixture' where id=previous.id;
  update public.cart_items set quantity=2 where cart_id=f.other_cart_id;
  begin
    perform public.replace_unattempted_live_checkout(f.other_cart_id,f.owner_id,previous.request_key,key,'order_replacefixture');
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'FAIL: another user replaced checkout.'; end if;
  replacement:=public.replace_unattempted_live_checkout(f.other_cart_id,f.other_id,previous.request_key,key,'order_replacefixture');
  if replacement.total_paise<>100000 then raise exception 'FAIL: replacement did not reprice updated cart.'; end if;
  if (select status from public.payment_orders where id=previous.id)<>'cancelled' then raise exception 'FAIL: old reservation not released.'; end if;
  if (public.replace_unattempted_live_checkout(f.other_cart_id,f.other_id,previous.request_key,key,'order_replacefixture')).id<>replacement.id then
    raise exception 'FAIL: replacement retry duplicated order.';
  end if;
  result:=public.settle_live_checkout(previous.id,'pay_replacelate',50000,'INR');
  if result->>'status'<>'review_required' then raise exception 'FAIL: superseded payment was fulfilled.'; end if;
  if exists(select 1 from public.order_confirmation_emails where order_id=previous.id) then raise exception 'FAIL: superseded payment sent confirmation.'; end if;
  if (select available_quantity from public.product_variants where id=f.variant_id)<>3 then raise exception 'FAIL: replacement changed stock before payment.'; end if;
  delete from public.payment_orders where id in (previous.id,replacement.id);
  update public.cart_items set quantity=1 where cart_id=f.other_cart_id;
  update public.product_variants set available_quantity=1 where id=f.variant_id;
end;
$$;
do $$
declare f record; rejected boolean:=false; coupon public.welcome_coupons; o public.payment_orders; settled jsonb;
begin
  select * into f from live_fixture;
  update public.checkout_settings set live_enabled=false;
  begin perform public.prepare_live_checkout(f.cart_id,f.owner_id,f.request_id); exception when others then rejected:=true; end;
  if not rejected then raise exception 'FAIL: live gate bypassed.'; end if;
  update public.checkout_settings set live_enabled=true;
  update public.cart_delivery_details set details=jsonb_set(details,'{email}','""'::jsonb) where cart_id=f.other_cart_id;
  rejected:=false;
  begin perform public.prepare_live_checkout(f.other_cart_id,f.other_id,gen_random_uuid()); exception when others then rejected:=true; end;
  if not rejected then raise exception 'FAIL: checkout without confirmation email accepted.'; end if;
  update public.cart_delivery_details set details=jsonb_set(details,'{email}',to_jsonb('live-'||f.other_id||'@example.invalid')) where cart_id=f.other_cart_id;
  update public.welcome_offer set enabled=true;
  coupon:=public.claim_welcome_coupon(f.owner_id);
  update public.welcome_coupons set percent=10,max_discount_rupees=100,minimum_subtotal_rupees=500 where id=coupon.id;
  update public.cart_delivery_details set welcome_coupon_id=coupon.id where cart_id=f.cart_id;
  o:=public.prepare_live_checkout(f.cart_id,f.owner_id,f.request_id);
  insert into live_order values(o.id);
  if o.subtotal_paise<>50000 or o.discount_paise<>5000 or o.shipping_paise<>10000 or o.total_paise<>55000 then
    raise exception 'FAIL: trusted pricing, coupon or post-discount shipping.';
  end if;
  if o.customer_user_id<>f.owner_id or o.delivery_details->>'addressLine1'<>'12 Test Street' then raise exception 'FAIL: order ownership/address snapshot.'; end if;
  if (public.prepare_live_checkout(f.cart_id,f.owner_id,f.request_id)).id<>o.id then raise exception 'FAIL: idempotent preparation.'; end if;
  rejected:=false;
  begin perform public.prepare_live_checkout(f.other_cart_id,f.other_id,gen_random_uuid()); exception when others then rejected:=true; end;
  if not rejected then raise exception 'FAIL: reserved inventory oversold.'; end if;
  if (select available_quantity from public.product_variants where id=f.variant_id)<>1 then raise exception 'FAIL: unpaid order changed stock.'; end if;
  update public.payment_orders set razorpay_order_id='order_livefixture',status='link_created' where id=o.id;
  rejected:=false;
  begin perform public.settle_live_checkout(o.id,'pay_livefixture',1,'INR'); exception when others then rejected:=true; end;
  if not rejected then raise exception 'FAIL: amount mismatch settled.'; end if;
  settled:=public.record_razorpay_checkout_event('live-event','payment.captured','order_livefixture','pay_livefixture',55000,'INR');
  if settled->>'status'<>'paid' then raise exception 'FAIL: captured order not confirmed.'; end if;
  if (select available_quantity from public.product_variants where id=f.variant_id)<>0 then raise exception 'FAIL: stock not deducted.'; end if;
  if (select redeemed_order_id from public.welcome_coupons where id=coupon.id)<>o.id then raise exception 'FAIL: coupon not consumed.'; end if;
  if (select count(*) from public.order_confirmation_emails where order_id=o.id)<>2 then raise exception 'FAIL: paid order did not queue customer/store emails.'; end if;
  if exists(select 1 from public.cart_items where cart_id=f.cart_id) then raise exception 'FAIL: paid unchanged cart not cleared.'; end if;
  perform public.settle_live_checkout(o.id,'pay_livefixture',55000,'INR');
  perform public.record_razorpay_checkout_event('live-event','payment.captured','order_livefixture','pay_livefixture',55000,'INR');
  if (select count(*) from public.order_confirmation_emails where order_id=o.id)<>2 then raise exception 'FAIL: duplicate settlement duplicated emails.'; end if;
  if (select available_quantity from public.product_variants where id=f.variant_id)<>0 then raise exception 'FAIL: duplicate settlement changed stock.'; end if;
  update public.product_variants set available_quantity=3,in_stock=true where id=f.variant_id;
  insert into public.cart_items(cart_id,product_id,variant_id,product_name,variant_name,image_url,quantity,unit_price)
    values(f.cart_id,f.product_id::text,f.variant_id::text,'Saved item','Test variant','',1,500);
  o:=public.prepare_live_checkout(f.cart_id,f.owner_id,gen_random_uuid());
  if o.discount_paise<>0 or o.shipping_paise<>0 then raise exception 'FAIL: new order reused a paid coupon or charged shipping at the threshold.'; end if;
  update public.payment_orders set razorpay_order_id='order_secondfixture',status='link_created' where id=o.id;
  update public.cart_items set quantity=2 where cart_id=f.cart_id;
  perform public.settle_live_checkout(o.id,'pay_secondfixture',50000,'INR');
  if (select quantity from public.cart_items where cart_id=f.cart_id)<>2 then raise exception 'FAIL: concurrent cart edit was lost.'; end if;
  o:=public.prepare_live_checkout(f.other_cart_id,f.other_id,gen_random_uuid());
  update public.payment_orders set razorpay_order_id='order_latefixture',status='link_created',expires_at=now()-interval '1 minute' where id=o.id;
  settled:=public.settle_live_checkout(o.id,'pay_latefixture',50000,'INR');
  if settled->>'status'<>'review_required' then raise exception 'FAIL: late capture confirmed without review.'; end if;
  if exists(select 1 from public.order_confirmation_emails where order_id=o.id) then raise exception 'FAIL: review order queued confirmation.'; end if;
  if (select available_quantity from public.product_variants where id=f.variant_id)<>2 then raise exception 'FAIL: late capture deducted stock.'; end if;
  rejected:=false;
  begin perform public.settle_live_checkout(o.id,'pay_differentfixture',50000,'INR'); exception when others then rejected:=true; end;
  if not rejected then raise exception 'FAIL: review payment identity was overwritten.'; end if;
  update public.payment_orders set status='cancelled' where id=o.id;
  o:=public.prepare_live_checkout(f.other_cart_id,f.other_id,gen_random_uuid());
  update public.payment_orders set razorpay_order_id='order_missingfixture',status='link_created' where id=o.id;
  update public.payment_order_items set product_id=gen_random_uuid() where order_id=o.id;
  settled:=public.settle_live_checkout(o.id,'pay_missingfixture',50000,'INR');
  if settled->>'status'<>'review_required' then raise exception 'FAIL: missing product confirmed without review.'; end if;
  if (select available_quantity from public.product_variants where id=f.variant_id)<>2 then raise exception 'FAIL: missing product deducted stock.'; end if;
end;
$$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',(select owner_id from live_fixture),'role','authenticated')::text,true);
set local role authenticated;
do $$
declare result jsonb; rejected boolean:=false;
begin
  result:=public.get_live_checkout_status((select request_id from live_fixture));
  if result->>'status'<>'paid' then raise exception 'FAIL: owner cannot see confirmation.'; end if;
  begin perform public.settle_live_checkout((select id from live_order),'pay_forged',55000,'INR'); exception when others then rejected:=true; end;
  if not rejected then raise exception 'FAIL: customer can settle a payment.'; end if;
  if jsonb_array_length(public.get_customer_orders())<>2 then raise exception 'FAIL: live order missing from history.'; end if;
  rejected:=false;
  begin perform public.get_admin_live_orders(); exception when others then rejected:=true; end;
  if not rejected then raise exception 'FAIL: non-admin can list live orders.'; end if;
end;
$$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',(select other_id from live_fixture),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
  if public.get_live_checkout_status((select request_id from live_fixture)) is not null then raise exception 'FAIL: another customer can see confirmation.'; end if;
end $$;
reset role;
insert into public.catalogue_admins(user_id) select owner_id from live_fixture;
select set_config('request.jwt.claims',json_build_object('sub',(select owner_id from live_fixture),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
  if not exists(select 1 from jsonb_array_elements(public.get_admin_live_orders()) o
    where o->>'id'=(select id::text from live_order) and o->'deliveryDetails'->>'addressLine1'='12 Test Street') then
    raise exception 'FAIL: admin cannot fulfil saved live order.';
  end if;
end $$;
rollback;
