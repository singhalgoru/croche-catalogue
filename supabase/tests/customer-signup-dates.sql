begin;
create temporary table signup_date_fixture as
select gen_random_uuid() customer_id, gen_random_uuid() admin_id,
  gen_random_uuid() session_id, gen_random_uuid() factor_id;
grant select on signup_date_fixture to authenticated;
insert into auth.users(id,is_anonymous,created_at,last_sign_in_at)
select customer_id,true,now()-interval '14 days',now()-interval '14 days' from signup_date_fixture;
insert into auth.users(id) select admin_id from signup_date_fixture;
insert into public.catalogue_admins(user_id) select admin_id from signup_date_fixture;
insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at,secret)
select factor_id,admin_id,'totp','verified',now(),now(),'fixture' from signup_date_fixture;
insert into auth.sessions(id,user_id,factor_id,aal,created_at,updated_at)
select session_id,admin_id,factor_id,'aal2',now(),now() from signup_date_fixture;

select set_config('request.jwt.claims',jsonb_build_object(
  'sub',customer_id,'role','authenticated')::text,true) from signup_date_fixture;
set local role authenticated;
select public.stage_customer_signup(jsonb_build_object(
  'name','Signup Test','phone','9876543210','email',customer_id||'@example.invalid',
  'addressLine1','12 Test Street','city','Delhi','state','Delhi','pincode','110001'))
from signup_date_fixture;
reset role;
do $$ begin
  if not exists(select 1 from public.pending_customer_signups
    where user_id=(select customer_id from signup_date_fixture) and submitted_at=now()) then
    raise exception 'FAIL: signup submission timestamp was not recorded.';
  end if;
  if exists(select 1 from public.customer_welcome_emails
    where user_id=(select customer_id from signup_date_fixture)) then
    raise exception 'FAIL: welcome email queued before verification.';
  end if;
end $$;
update public.pending_customer_signups set submitted_at=now()-interval '1 hour'
where user_id=(select customer_id from signup_date_fixture);
set local role authenticated;
select public.stage_customer_signup(jsonb_build_object(
  'name','Signup Test','phone','9876543210','email',customer_id||'@example.invalid',
  'addressLine1','12 Test Street','city','Delhi','state','Delhi','pincode','110001'))
from signup_date_fixture;
reset role;
select set_config('request.jwt.claims',jsonb_build_object(
  'sub',admin_id,'role','authenticated','aal','aal2','session_id',session_id,
  'amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from now())))))::text,true)
from signup_date_fixture;
set local role authenticated;
do $$ declare customer jsonb; begin
  select item into customer from jsonb_array_elements(public.get_admin_customer_summary()->'customers') item
  where item->>'id'=(select customer_id::text from signup_date_fixture);
  if customer is null or (customer->>'registeredAt')::timestamptz is distinct from now()
    or customer->>'lastSignInAt' is not null or (customer->>'verified')::boolean
    or customer->>'welcomeStatus' is distinct from 'not_queued' then
    raise exception 'FAIL: pending signup uses guest dates or incorrect activation/email status.';
  end if;
end $$;
reset role;

update auth.users set email=id||'@example.invalid',email_confirmed_at=now(),is_anonymous=false
where id=(select customer_id from signup_date_fixture);
set local role authenticated;
do $$ declare customer jsonb; begin
  select item into customer from jsonb_array_elements(public.get_admin_customer_summary()->'customers') item
  where item->>'id'=(select customer_id::text from signup_date_fixture);
  if customer is null or not (customer->>'verified')::boolean
    or customer->>'welcomeStatus' is distinct from 'pending'
    or customer->>'lastSignInAt' is not null then
    raise exception 'FAIL: activation did not queue welcome email or exposed guest sign-in.';
  end if;
end $$;
reset role;
update auth.users set last_sign_in_at=now() where id=(select customer_id from signup_date_fixture);
set local role authenticated;
do $$ declare customer jsonb; begin
  select item into customer from jsonb_array_elements(public.get_admin_customer_summary()->'customers') item
  where item->>'id'=(select customer_id::text from signup_date_fixture);
  if (customer->>'lastSignInAt')::timestamptz is distinct from now() then
    raise exception 'FAIL: registered account sign-in is missing.';
  end if;
end $$;
reset role;
rollback;
