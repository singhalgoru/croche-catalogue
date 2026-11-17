begin;

create temporary table integration_fixture as
select gen_random_uuid() owner_id, gen_random_uuid() admin_id, gen_random_uuid() customer_id;
grant select on integration_fixture to authenticated, anon;

update public.catalogue_admins set is_owner = false where is_owner;
insert into auth.users(id, email, email_confirmed_at, is_anonymous)
select owner_id, owner_id || '@example.invalid', now(), false from integration_fixture union all
select admin_id, admin_id || '@example.invalid', now(), false from integration_fixture union all
select customer_id, customer_id || '@example.invalid', now(), false from integration_fixture;
insert into public.catalogue_admins(user_id, is_owner)
select owner_id, true from integration_fixture union all
select admin_id, false from integration_fixture;
update public.admin_security_settings set locked = false;

create temporary table integration_sessions as
select user_id, gen_random_uuid() session_id, gen_random_uuid() factor_id
from (
  select owner_id user_id from integration_fixture union all
  select admin_id from integration_fixture union all
  select customer_id from integration_fixture
) users;
grant select on integration_sessions to authenticated;
insert into auth.mfa_factors(id, user_id, factor_type, status, created_at, updated_at, secret)
select factor_id, user_id, 'totp', 'verified', now(), now(), 'fixture' from integration_sessions;
insert into auth.sessions(id, user_id, factor_id, aal, created_at, updated_at)
select session_id, user_id, factor_id, 'aal2', now(), now() from integration_sessions;

-- Avoid dispatching a real site rebuild from rolled-back test writes.
alter table public.site_integrations disable trigger request_site_rebuild;

select set_config('request.jwt.claims', jsonb_build_object(
  'sub', user_id, 'role', 'authenticated', 'aal', 'aal2', 'session_id', session_id,
  'amr', jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', floor(extract(epoch from now()))))
)::text, true) from integration_sessions where user_id = (select admin_id from integration_fixture);
set local role authenticated;
do $$
declare denied boolean := false;
begin
  if not public.is_catalogue_admin() then raise exception 'FAIL: admin fixture is not MFA-verified.'; end if;
  if public.can_update_site_integrations() then raise exception 'FAIL: regular admin can edit integrations.'; end if;
  perform whatsapp_number from public.site_integrations;
  begin
    perform public.update_site_integrations('919876543210', 'G-TEST1234', '123456789');
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'FAIL: regular admin bypassed owner-only RPC.'; end if;
  denied := false;
  begin update public.catalogue_admins set is_owner = true where user_id = auth.uid();
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'FAIL: regular admin can grant themselves owner access.'; end if;
end $$;
reset role;

select set_config('request.jwt.claims', jsonb_build_object(
  'sub', user_id, 'role', 'authenticated', 'aal', 'aal2', 'session_id', session_id,
  'amr', jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', floor(extract(epoch from now()))))
)::text, true) from integration_sessions where user_id = (select owner_id from integration_fixture);
set local role authenticated;
do $$
declare denied boolean := false;
begin
  if not public.can_update_site_integrations() then raise exception 'FAIL: verified owner rejected.'; end if;
  if not public.update_site_integrations('+91 98765 43210', 'g-test1234', '123456789') then
    raise exception 'FAIL: owner save not confirmed.';
  end if;
  if not exists (
    select 1 from public.site_integrations where whatsapp_number = '919876543210'
      and google_analytics_measurement_id = 'G-TEST1234' and meta_pixel_id = '123456789'
  ) then raise exception 'FAIL: owner settings were not normalized and saved.'; end if;
  perform public.update_site_integrations('919876543210', '', '');
  if not exists (select 1 from public.site_integrations
    where google_analytics_measurement_id = '' and meta_pixel_id = '') then
    raise exception 'FAIL: owner cannot disable tracking.';
  end if;
  begin update public.site_integrations set meta_pixel_id = '999999999';
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'FAIL: direct table writes permitted.'; end if;
end $$;
reset role;

select set_config('request.jwt.claims', jsonb_build_object(
  'sub', user_id, 'role', 'authenticated', 'aal', 'aal1', 'session_id', session_id
)::text, true) from integration_sessions where user_id = (select owner_id from integration_fixture);
set local role authenticated;
do $$
declare denied boolean := false;
begin
  if public.can_update_site_integrations() then raise exception 'FAIL: password-only owner can edit.'; end if;
  begin perform public.update_site_integrations('919876543210', '', '');
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'FAIL: owner bypassed MFA in save RPC.'; end if;
end $$;
reset role;

select set_config('request.jwt.claims', jsonb_build_object(
  'sub', user_id, 'role', 'authenticated', 'aal', 'aal2', 'session_id', session_id,
  'amr', jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', floor(extract(epoch from now()))))
)::text, true) from integration_sessions where user_id = (select customer_id from integration_fixture);
set local role authenticated;
do $$
declare denied boolean := false;
begin
  if public.can_update_site_integrations() then raise exception 'FAIL: customer can edit integrations.'; end if;
  begin perform public.update_site_integrations('919876543210', '', '');
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'FAIL: customer bypassed owner-only RPC.'; end if;
end $$;
reset role;

select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
do $$
declare denied boolean := false;
begin
  perform whatsapp_number from public.site_integrations;
  begin perform public.update_site_integrations('919876543210', '', '');
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'FAIL: anonymous save permitted.'; end if;
end $$;
reset role;
rollback;
