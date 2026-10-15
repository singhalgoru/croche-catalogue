begin;
create temporary table discount_fixture as
select gen_random_uuid() admin_id, gen_random_uuid() customer_id,
  gen_random_uuid() session_id, gen_random_uuid() factor_id, gen_random_uuid() product_id,
  gen_random_uuid() variant_id, gen_random_uuid() fallback_variant_id, gen_random_uuid() cart_id;
grant select on discount_fixture to authenticated, service_role;
insert into auth.users(id,email,email_confirmed_at,is_anonymous)
select admin_id,'discount-admin-'||admin_id||'@example.invalid',now(),false from discount_fixture
union all select customer_id,'discount-customer-'||customer_id||'@example.invalid',now(),false from discount_fixture;
insert into public.catalogue_admins(user_id) select admin_id from discount_fixture;
insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at,secret)
select factor_id,admin_id,'totp','verified',now(),now(),'fixture' from discount_fixture;
insert into auth.sessions(id,user_id,factor_id,aal,created_at,updated_at)
select session_id,admin_id,factor_id,'aal2',now(),now() from discount_fixture;
insert into public.products(id,name,category,description,color,image_path,image_url,created_by,published,price,show_price)
select product_id,'Discount fixture',(select name from public.categories where not is_seasonal limit 1),
  'Discount test.','#ffffff','fixture/'||product_id,'https://example.test/discount.png',admin_id,true,500,true
from discount_fixture;
insert into public.product_variants(id,product_id,name,color,image_path,image_url,in_stock,available_quantity,price)
select variant_id,product_id,'Override','#ffffff','fixture/'||variant_id,'https://example.test/variant.png',true,10,750 from discount_fixture
union all select fallback_variant_id,product_id,'Fallback','#ffffff','fixture/'||fallback_variant_id,
  'https://example.test/fallback.png',true,10,null from discount_fixture;
select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal2',
  'session_id',session_id,'amr',jsonb_build_array(jsonb_build_object('method','totp',
  'timestamp',floor(extract(epoch from now())))))::text,true) from discount_fixture;
set local role authenticated;
do $$
declare f record; invalid integer;
begin
  select * into f from discount_fixture;
  foreach invalid in array array[-1,91,null]::integer[] loop
    begin
      perform public.set_product_discount(f.product_id,invalid);
      raise exception 'FAIL: invalid discount accepted.';
    exception when invalid_parameter_value then null;
    end;
  end loop;
  perform public.set_product_discount(f.product_id,20);
  if not exists(select 1 from public.products where id=f.product_id and price=400 and regular_price=500 and discount_percent=20)
    or not exists(select 1 from public.product_variants where id=f.variant_id and price=600 and regular_price=750)
    or not exists(select 1 from public.product_variants where id=f.fallback_variant_id and price is null and regular_price is null) then
    raise exception 'FAIL: product or variant discount is incorrect.';
  end if;
  perform public.set_product_discount(f.product_id,30);
  if (select price from public.products where id=f.product_id)<>350
    or (select price from public.product_variants where id=f.variant_id)<>525 then
    raise exception 'FAIL: changing discount compounded the original offer.';
  end if;
  begin
    update public.products set price=999 where id=f.product_id;
    raise exception 'FAIL: active regular price edit accepted.';
  exception when raise_exception then
    if SQLERRM <> 'Remove the product discount before changing its regular price.' then raise; end if;
  end;
  begin
    update public.product_variants set price=999 where id=f.variant_id;
    raise exception 'FAIL: active variant price edit accepted.';
  exception when raise_exception then
    if SQLERRM <> 'Remove the product discount before changing variant prices.' then raise; end if;
  end;
  update public.products set description='Edited during discount.' where id=f.product_id;
  update public.product_variants set available_quantity=9 where id=f.variant_id;
  insert into public.product_variants(product_id,name,color,image_path,image_url,in_stock,available_quantity,price)
  values(f.product_id,'New during offer','#ffffff','fixture/new','https://example.test/new.png',true,1,101);
  if not exists(select 1 from public.product_variants where product_id=f.product_id
    and name='New during offer' and regular_price=101 and price=71) then
    raise exception 'FAIL: new variant did not inherit the active discount with whole-rupee rounding.';
  end if;
end $$;
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
insert into public.carts(id,user_id,delivery_pin_code) select cart_id,customer_id,'110001' from discount_fixture;
insert into public.cart_delivery_details(cart_id,details)
select cart_id,jsonb_build_object('name','Discount Customer','phone','9876543210',
  'email','discount-customer-'||customer_id||'@example.invalid','addressLine1','12 Test Street','addressLine2','',
  'city','Delhi','state','Delhi','pincode','110001') from discount_fixture;
select set_config('request.jwt.claims',jsonb_build_object('sub',customer_id,'role','authenticated')::text,true)
from discount_fixture;
set local role authenticated;
insert into public.cart_items(cart_id,product_id,variant_id,product_name,variant_name,image_url,quantity,unit_price)
select cart_id,product_id::text,variant_id::text,'Untrusted','Untrusted','',1,1 from discount_fixture;
do $$ begin
  if (select unit_price from public.cart_items where cart_id=(select cart_id from discount_fixture))<>525 then
    raise exception 'FAIL: cart did not enforce discounted price.';
  end if;
  begin
    perform public.set_product_discount((select product_id from discount_fixture),50);
    raise exception 'FAIL: customer changed discount.';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
update public.checkout_settings set live_enabled=true;
set local role service_role;
do $$
declare f record; o public.payment_orders;
begin
  select * into f from discount_fixture;
  o := public.prepare_live_checkout(f.cart_id,f.customer_id,gen_random_uuid());
  if o.subtotal_paise<>52500 or
    (select unit_price_paise from public.payment_order_items where order_id=o.id)<>52500 then
    raise exception 'FAIL: live payment did not use the discounted price.';
  end if;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal2',
  'session_id',session_id,'amr',jsonb_build_array(jsonb_build_object('method','totp',
  'timestamp',floor(extract(epoch from now())))))::text,true) from discount_fixture;
set local role authenticated;
do $$
declare f record;
begin
  select * into f from discount_fixture;
  perform public.set_product_discount(f.product_id,0);
  if not exists(select 1 from public.products where id=f.product_id and price=500 and regular_price is null and discount_percent=0)
    or not exists(select 1 from public.product_variants where id=f.variant_id and price=750 and regular_price is null) then
    raise exception 'FAIL: regular prices were not restored.';
  end if;
  if not exists(select 1 from public.product_variants where product_id=f.product_id
    and name='New during offer' and regular_price is null and price=101) then
    raise exception 'FAIL: new variant regular price was not restored.';
  end if;
  update public.products set show_price=false where id=f.product_id;
  begin
    perform public.set_product_discount(f.product_id,20);
    raise exception 'FAIL: hidden price was discounted.';
  exception when raise_exception then
    if SQLERRM <> 'Set a public product price before running a discount.' then raise; end if;
  end;
end $$;
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $$ begin
  if (select subtotal_paise from public.payment_orders where cart_id=(select cart_id from discount_fixture)) is distinct from 52500 then
    raise exception 'FAIL: an existing checkout quote was changed.';
  end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal1',
  'session_id',session_id)::text,true) from discount_fixture;
set local role authenticated;
do $$ begin
  perform public.set_product_discount((select product_id from discount_fixture),20);
  raise exception 'FAIL: password-only admin changed discounts.';
exception when insufficient_privilege then null;
end $$;
reset role;
rollback;
