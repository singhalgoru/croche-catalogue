begin;
create temporary table suspension_fixture as
select gen_random_uuid() as admin_id, gen_random_uuid() as customer_id, gen_random_uuid() as other_id,
  gen_random_uuid() as session_id, gen_random_uuid() as new_session_id;
grant select on suspension_fixture to authenticated, service_role;
insert into auth.users(id, email, email_confirmed_at, is_anonymous)
select admin_id, admin_id || '@example.invalid', now(), false from suspension_fixture union all
select customer_id, customer_id || '@example.invalid', now(), false from suspension_fixture union all
select other_id, other_id || '@example.invalid', now(), false from suspension_fixture;
insert into public.catalogue_admins(user_id) select admin_id from suspension_fixture;
insert into auth.sessions(id, user_id) select session_id, customer_id from suspension_fixture;
insert into auth.refresh_tokens(token, user_id, session_id, revoked)
select gen_random_uuid()::text, customer_id::text, session_id, false from suspension_fixture;
insert into public.customer_profiles(user_id, email, details)
select customer_id, customer_id || '@example.invalid',
  '{"name":"Test Buyer","phone":"9876543210","city":"Delhi","pincode":"110001"}'::jsonb from suspension_fixture;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
do $$ declare f record; rejected boolean := false; begin
  select * into f from suspension_fixture;
  if (public.customer_account_candidate(f.admin_id, f.customer_id)->>'suspended')::boolean then
    raise exception 'FAIL: active account marked suspended.';
  end if;
  begin perform public.customer_account_candidate(f.admin_id, f.admin_id);
  exception when others then rejected := true; end;
  if not rejected then raise exception 'FAIL: admin can be targeted.'; end if;
  rejected := false;
  begin perform public.customer_account_candidate(f.customer_id, f.other_id);
  exception when others then rejected := true; end;
  if not rejected then raise exception 'FAIL: customer authorized as admin.'; end if;
end $$;
reset role;
update auth.users set banned_until = now() + interval '100 years'
where id = (select customer_id from suspension_fixture);
do $$ begin
  if exists(select 1 from auth.sessions where user_id = (select customer_id from suspension_fixture))
    or exists(select 1 from auth.refresh_tokens where user_id = (select customer_id::text from suspension_fixture)) then
    raise exception 'FAIL: refresh tokens or sessions survived suspension.';
  end if;
end $$;
do $$ declare rejected boolean := false; begin
  begin update auth.users set banned_until = now() + interval '1 day'
    where id = (select admin_id from suspension_fixture);
  exception when others then rejected := true; end;
  if not rejected then raise exception 'FAIL: admin ban allowed.'; end if;
  rejected := false;
  begin insert into public.catalogue_admins(user_id) select customer_id from suspension_fixture;
  exception when others then rejected := true; end;
  if not rejected then raise exception 'FAIL: suspended account promoted to admin.'; end if;
end $$;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
do $$ declare f record; rejected boolean := false; begin
  select * into f from suspension_fixture;
  if not (public.customer_account_candidate(f.admin_id, f.customer_id)->>'suspended')::boolean then
    raise exception 'FAIL: suspended state absent.';
  end if;
  perform public.check_account_suspension();
end $$;
reset role;
select set_config('request.jwt.claims', json_build_object(
  'role', 'authenticated', 'sub', (select customer_id from suspension_fixture),
  'session_id', (select session_id from suspension_fixture))::text, true);
set local role authenticated;
do $$ declare rejected boolean := false; begin
  begin perform public.check_account_suspension();
  exception when sqlstate 'PT403' then rejected := true; end;
  if not rejected then raise exception 'FAIL: already-issued customer JWT accepted.'; end if;
  rejected := false;
  begin perform public.customer_account_candidate((select admin_id from suspension_fixture), (select customer_id from suspension_fixture));
  exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'FAIL: customer can bypass reauthentication.'; end if;
  rejected := false;
  begin perform 1 from public.customer_account_audit;
  exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'FAIL: browser can read private security reasons.'; end if;
end $$;
reset role;
update auth.users set banned_until = null where id = (select customer_id from suspension_fixture);
set local role authenticated;
do $$ declare rejected boolean := false; begin
  begin perform public.check_account_suspension();
  exception when sqlstate 'PT403' then rejected := true; end;
  if not rejected then raise exception 'FAIL: old JWT revived after restoring account.'; end if;
end $$;
reset role;
insert into auth.sessions(id, user_id) select new_session_id, customer_id from suspension_fixture;
select set_config('request.jwt.claims', json_build_object(
  'role', 'authenticated', 'sub', (select customer_id from suspension_fixture),
  'session_id', (select new_session_id from suspension_fixture))::text, true);
set local role authenticated;
select public.check_account_suspension();
reset role;
do $$ begin
  if not exists(select 1 from public.customer_profiles where user_id = (select customer_id from suspension_fixture)) then
    raise exception 'FAIL: suspension deleted profile.';
  end if;
  if not exists(select 1 from pg_roles r, unnest(r.rolconfig) c
    where r.rolname = 'authenticator' and c = 'pgrst.db_pre_request=public.check_account_suspension') then
    raise exception 'FAIL: API request hook not installed.';
  end if;
end $$;
rollback;
