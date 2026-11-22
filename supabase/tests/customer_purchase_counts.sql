-- Rollback-only checks; run against a migrated TEST database.
begin;
create temporary table purchase_count_fixture as select gen_random_uuid() admin_id, gen_random_uuid() session_id,
  gen_random_uuid() factor_id, gen_random_uuid() buyer_id, gen_random_uuid() test_id;
grant select on purchase_count_fixture to authenticated, anon;
insert into auth.users(id,email,email_confirmed_at,is_anonymous)
select admin_id, admin_id::text || '@example.invalid', now(), false from purchase_count_fixture
union all select buyer_id, buyer_id::text || '@example.invalid', now(), false from purchase_count_fixture
union all select test_id, test_id::text || '@example.invalid', now(), false from purchase_count_fixture;
insert into public.catalogue_admins(user_id) select admin_id from purchase_count_fixture;
insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at,secret)
  select factor_id,admin_id,'totp','verified',now(),now(),'fixture' from purchase_count_fixture;
insert into auth.sessions(id,user_id,factor_id,aal,created_at,updated_at)
  select session_id,admin_id,factor_id,'aal2',now(),now() from purchase_count_fixture;
insert into public.customer_profiles(user_id,email,details)
select buyer_id,buyer_id::text || '@example.invalid','{"name":"Buyer"}'::jsonb from purchase_count_fixture
union all select test_id,test_id::text || '@example.invalid','{"name":"Test account"}'::jsonb from purchase_count_fixture;
insert into public.payment_orders(reference,request_key,created_by,customer_user_id,customer_name,customer_contact,
  customer_email,subtotal_paise,shipping_paise,total_paise,status,paid_at,razorpay_link_id,payment_url,expires_at)
select 'COUNT-' || gen_random_uuid(),gen_random_uuid(),admin_id,buyer_id,'Buyer','+919876543210',
  buyer_id::text || '@example.invalid',100,0,100,'paid',now(),'plink_' || gen_random_uuid(),'https://example.invalid/pay',now()
from purchase_count_fixture
union all
select 'COUNT-' || gen_random_uuid(),gen_random_uuid(),admin_id,null,'Buyer','+919876543210',
  upper(buyer_id::text || '@example.invalid'),100,0,100,'paid',now(),'plink_' || gen_random_uuid(),'https://example.invalid/pay',now()
from purchase_count_fixture
union all
select 'COUNT-' || gen_random_uuid(),gen_random_uuid(),admin_id,test_id,'Test account','+919876543210',
  test_id::text || '@example.invalid',100,0,100,'paid',now(),'plink_' || gen_random_uuid(),'https://example.invalid/pay',now()
from purchase_count_fixture
union all
select 'COUNT-' || gen_random_uuid(),gen_random_uuid(),admin_id,test_id,'Test account','+919876543210',
  buyer_id::text || '@example.invalid',100,0,100,'paid',now(),'plink_' || gen_random_uuid(),'https://example.invalid/pay',now()
from purchase_count_fixture
union all
select 'COUNT-' || gen_random_uuid(),gen_random_uuid(),admin_id,buyer_id,'Buyer','+919876543210',
  buyer_id::text || '@example.invalid',100,0,100,'link_created',null,'plink_' || gen_random_uuid(),'https://example.invalid/pay',now()
from purchase_count_fixture;
insert into public.payment_orders(reference,request_key,created_by,customer_user_id,customer_name,customer_contact,
  customer_email,subtotal_paise,shipping_paise,total_paise,status,is_test_checkout,expires_at)
select 'COUNT-TEST-' || gen_random_uuid(),gen_random_uuid(),admin_id,buyer_id,'Buyer','+919876543210',
  buyer_id::text || '@example.invalid',100,0,100,'creating_checkout',true,now() from purchase_count_fixture;
select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal2','session_id',session_id,
  'amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from now())))))::text,true) from purchase_count_fixture;
set local role authenticated;
do $$ declare result jsonb; buyer jsonb; test_customer jsonb; before_total bigint; begin
  result := public.get_admin_customer_summary();
  select c into buyer from jsonb_array_elements(result->'customers') c where c->>'id'=(select buyer_id::text from purchase_count_fixture);
  if (buyer->>'purchaseCount')::int <> 2 then raise exception 'FAIL: paid order, fallback, unpaid or test filtering'; end if;
  before_total := (result->>'totalPurchases')::bigint;
  perform public.set_customer_purchase_exclusion((select test_id from purchase_count_fixture),true);
  result := public.get_admin_customer_summary();
  select c into test_customer from jsonb_array_elements(result->'customers') c where c->>'id'=(select test_id::text from purchase_count_fixture);
  if test_customer->>'purchaseExcluded' <> 'true' or test_customer->'purchaseCount' <> 'null'::jsonb
    or (result->>'totalPurchases')::bigint <> before_total - 2 then raise exception 'FAIL: test exclusion'; end if;
  perform public.set_customer_purchase_exclusion((select test_id from purchase_count_fixture),false);
  if (public.get_admin_customer_summary()->>'totalPurchases')::bigint <> before_total then raise exception 'FAIL: restore'; end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal1','session_id',session_id)::text,true) from purchase_count_fixture;
do $$ begin
  begin perform public.set_customer_purchase_exclusion((select test_id from purchase_count_fixture),true);
    raise exception 'FAIL: unverified exclusion';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin perform public.get_admin_customer_summary(); raise exception 'FAIL: unverified summary';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
end $$;
reset role;
do $$ begin
  if has_table_privilege('authenticated','public.customer_purchase_exclusions','SELECT')
    or has_function_privilege('anon','public.set_customer_purchase_exclusion(uuid,boolean)','EXECUTE') then
    raise exception 'FAIL: exclusion access';
  end if;
end $$;
rollback;
