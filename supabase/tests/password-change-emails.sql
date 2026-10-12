begin;
create temporary table password_fixture as select gen_random_uuid() as admin,gen_random_uuid() as customer,gen_random_uuid() as guest;
grant select on password_fixture to service_role,authenticated;
insert into auth.users(id,email,email_confirmed_at,is_anonymous,encrypted_password)
select admin,admin||'@example.invalid',now(),false,'fixture-original' from password_fixture union all
select customer,customer||'@example.invalid',now(),false,'fixture-original' from password_fixture union all
select guest,guest||'@example.invalid',null,true,'' from password_fixture;
insert into public.catalogue_admins(user_id) select admin from password_fixture;
update auth.users set encrypted_password='fixture-updated' where id in(select admin from password_fixture union all select customer from password_fixture);
update auth.users set encrypted_password='fixture-updated' where id=(select customer from password_fixture);
update auth.users set raw_user_meta_data='{"full_name":"Changed name"}',last_sign_in_at=now() where id=(select admin from password_fixture);
update auth.users set encrypted_password='fixture-guest' where id=(select guest from password_fixture);
do $$ declare f record; begin
  select * into f from password_fixture;
  if (select count(*) from public.password_change_emails where user_id in(f.admin,f.customer,f.guest))<>2 then
    raise exception 'FAIL: admin/customer changes not queued once or guest/name/login queued.';
  end if;
  if exists(select 1 from public.password_change_emails where user_id=f.guest) then raise exception 'FAIL: guest notification.'; end if;
end $$;
update auth.users set encrypted_password='fixture-second' where id=(select customer from password_fixture);
do $$ begin
  if (select count(*) from public.password_change_emails where user_id=(select customer from password_fixture))<>2 then
    raise exception 'FAIL: second password change not queued.';
  end if;
end $$;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
do $$ declare claimed integer; begin
  -- Only claim fixture jobs; leave unrelated production jobs untouched.
  update public.password_change_emails set next_attempt_at=now()+interval '1 day' where user_id not in(select admin from password_fixture union all select customer from password_fixture);
  select count(*) into claimed from public.claim_password_change_emails();
  if claimed<>3 then raise exception 'FAIL: expected three independent events.'; end if;
  if exists(select 1 from public.claim_password_change_emails()) then raise exception 'FAIL: claim lease did not prevent immediate retry.'; end if;
  update public.password_change_emails set attempts=8,next_attempt_at=now() where user_id=(select customer from password_fixture);
  update public.password_change_emails set accepted_at=now(),next_attempt_at=now() where user_id=(select admin from password_fixture);
  if exists(select 1 from public.claim_password_change_emails()) then raise exception 'FAIL: accepted or exhausted jobs retried.'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('role','authenticated','sub',(select customer from password_fixture))::text,true);
set local role authenticated;
do $$ declare rejected boolean:=false; begin
  begin perform 1 from public.password_change_emails;
  exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'FAIL: customer reads private notifications.'; end if;
  rejected:=false;
  begin perform public.claim_password_change_emails();
  exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'FAIL: client claims jobs.'; end if;
end $$;
reset role;
rollback;
