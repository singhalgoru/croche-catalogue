begin;
create temporary table reduction_fixture as
select gen_random_uuid() admin_id, gen_random_uuid() customer_id,
  gen_random_uuid() session_id, gen_random_uuid() factor_id,
  gen_random_uuid() product_id, gen_random_uuid() variant_id, gen_random_uuid() other_variant_id,
  gen_random_uuid() cart_id, gen_random_uuid() order_id;
grant select on reduction_fixture to authenticated;
insert into auth.users(id) select admin_id from reduction_fixture
union all select customer_id from reduction_fixture;
insert into public.catalogue_admins(user_id) select admin_id from reduction_fixture;
insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at,secret)
select factor_id,admin_id,'totp','verified',now(),now(),'fixture' from reduction_fixture;
insert into auth.sessions(id,user_id,factor_id,aal,created_at,updated_at)
select session_id,admin_id,factor_id,'aal2',now(),now() from reduction_fixture;
insert into public.products(id,name,category,description,color,image_path,image_url,created_by,published,price)
select product_id,'Stock reduction fixture',(select name from public.categories where not is_seasonal limit 1),
  'Stock adjustment test.','#ffffff','fixture/'||product_id,
  'https://example.test/stock.png',admin_id,false,100 from reduction_fixture;
insert into public.product_variants(id,product_id,name,color,image_path,image_url,in_stock,available_quantity)
select variant_id,product_id,'Primary','#ffffff','fixture/'||variant_id,
  'https://example.test/primary.png',true,5 from reduction_fixture
union all select other_variant_id,product_id,'Other','#ffffff','fixture/'||other_variant_id,
  'https://example.test/other.png',true,1 from reduction_fixture;
create temporary table reduction_sales_before as select count(*) total from public.seller_sales;
grant select on reduction_sales_before to authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal2',
  'session_id',session_id,'amr',jsonb_build_array(jsonb_build_object('method','totp',
  'timestamp',floor(extract(epoch from now())))))::text,true) from reduction_fixture;
set local role authenticated;
do $$
declare f record; invalid integer;
begin
  select * into f from reduction_fixture;
  perform public.reduce_variant_stock(f.variant_id,2);
  if (select available_quantity from public.product_variants where id=f.variant_id)<>3 then
    raise exception 'FAIL: reduction did not subtract from stock.';
  end if;
  foreach invalid in array array[0,-1,null]::integer[] loop
    begin
      perform public.reduce_variant_stock(f.variant_id,invalid);
      raise exception 'FAIL: invalid reduction was accepted.';
    exception when invalid_parameter_value then null;
    end;
  end loop;
  begin
    perform public.reduce_variant_stock(f.variant_id,4);
    raise exception 'FAIL: reduction below zero accepted.';
  exception when raise_exception then
    if SQLERRM not like 'Only 3 item(s) are available%' then raise; end if;
  end;
  if (select available_quantity from public.product_variants where id=f.variant_id)<>3 then
    raise exception 'FAIL: rejected reduction changed inventory.';
  end if;
end $$;
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
insert into public.carts(id,user_id) select cart_id,customer_id from reduction_fixture;
insert into public.payment_orders(id,reference,request_key,cart_id,created_by,customer_name,customer_contact,
  subtotal_paise,shipping_paise,total_paise,status,expires_at,razorpay_link_id,payment_url)
select order_id,'LUV-'||order_id::text,gen_random_uuid(),cart_id,customer_id,'Reduction fixture','+919876543210',
  100,0,100,'link_created',now()+interval '10 minutes','plink_'||replace(order_id::text,'-',''),
  'https://example.invalid' from reduction_fixture;
insert into public.payment_order_items(order_id,product_id,variant_id,product_name,variant_name,image_url,unit_price_paise,quantity)
select order_id,product_id,variant_id,'Reduction fixture','Primary','',100,2 from reduction_fixture;
select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal2',
  'session_id',session_id,'amr',jsonb_build_array(jsonb_build_object('method','totp',
  'timestamp',floor(extract(epoch from now())))))::text,true) from reduction_fixture;
set local role authenticated;
do $$
declare f record;
begin
  select * into f from reduction_fixture;
  begin
    perform public.reduce_variant_stock(f.variant_id,2);
    raise exception 'FAIL: reserved inventory was removed.';
  exception when raise_exception then
    if SQLERRM not like '2 item(s) are reserved for active payments%' then raise; end if;
  end;
  perform public.reduce_variant_stock(f.variant_id,1);
  if (select available_quantity from public.product_variants where id=f.variant_id)<>2 then
    raise exception 'FAIL: unreserved inventory could not be reduced.';
  end if;
end $$;
reset role;
update public.payment_orders set expires_at=now()-interval '1 minute'
where id=(select order_id from reduction_fixture);
set local role authenticated;
do $$
declare f record;
begin
  select * into f from reduction_fixture;
  perform public.reduce_variant_stock(f.variant_id,2);
  if exists(select 1 from public.product_variants where id=f.variant_id and (in_stock or available_quantity<>0)) then
    raise exception 'FAIL: zero inventory is not out of stock.';
  end if;
  if not (select in_stock from public.products where id=f.product_id) then
    raise exception 'FAIL: other stocked variant was ignored.';
  end if;
  perform public.reduce_variant_stock(f.other_variant_id,1);
  if (select in_stock from public.products where id=f.product_id) then
    raise exception 'FAIL: product with no inventory is still available.';
  end if;
  if (select count(*) from public.seller_sales)<>(select total from reduction_sales_before) then
    raise exception 'FAIL: a stock adjustment created a sales record.';
  end if;
  begin
    perform public.reduce_variant_stock(gen_random_uuid(),1);
    raise exception 'FAIL: missing variant was accepted.';
  exception when raise_exception then
    if SQLERRM <> 'The product variant no longer exists.' then raise; end if;
  end;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal1',
  'session_id',session_id)::text,true) from reduction_fixture;
set local role authenticated;
do $$ begin
  perform public.reduce_variant_stock((select variant_id from reduction_fixture),1);
  raise exception 'FAIL: password-only admin reduced stock.';
exception when insufficient_privilege then null;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',customer_id,'role','authenticated','aal','aal2')::text,true)
from reduction_fixture;
set local role authenticated;
do $$ begin
  perform public.reduce_variant_stock((select variant_id from reduction_fixture),1);
  raise exception 'FAIL: customer reduced stock.';
exception when insufficient_privilege then null;
end $$;
reset role;
rollback;
