create table public.customer_account_audit (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  target_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('suspend', 'restore')),
  reason text not null check (length(reason) between 5 and 300),
  created_at timestamptz not null default now()
);
alter table public.customer_account_audit enable row level security;
revoke all on public.customer_account_audit from public, anon, authenticated;
grant all on public.customer_account_audit to service_role;
grant usage, select on sequence public.customer_account_audit_id_seq to service_role;

create table public.customer_account_security (
  user_id uuid primary key references auth.users(id) on delete cascade,
  sessions_revoked_at timestamptz not null
);
alter table public.customer_account_security enable row level security;
revoke all on public.customer_account_security from public, anon, authenticated;
grant all on public.customer_account_security to service_role;

-- Auth bans prevent new sessions; this hook also rejects already-issued JWTs.
create function public.check_account_suspension()
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if auth.role() = 'authenticated' and exists(
    select 1 from auth.users where id = auth.uid() and banned_until > now()
  ) then
    raise sqlstate 'PT403' using message = 'This account is temporarily disabled. Contact hello@luviacreations.com for help.';
  end if;
  if auth.role() = 'authenticated' and exists(
    select 1 from public.customer_account_security where user_id = auth.uid()
      and not exists(select 1 from auth.sessions where user_id = auth.uid()
        and id = (auth.jwt()->>'session_id')::uuid)
  ) then
    raise sqlstate 'PT403' using message = 'This account session was revoked for security. Sign out and sign in again.';
  end if;
end $$;
revoke all on function public.check_account_suspension() from public;
grant execute on function public.check_account_suspension() to anon, authenticated, service_role;
do $$
begin
  if exists(select 1 from pg_roles r, unnest(r.rolconfig) c
    where r.rolname = 'authenticator' and c like 'pgrst.db_pre_request=%'
      and c <> 'pgrst.db_pre_request=public.check_account_suspension') then
    raise exception 'An existing API request hook must be integrated before enabling account suspension.';
  end if;
end $$;
alter role authenticator set pgrst.db_pre_request = 'public.check_account_suspension';
notify pgrst, 'reload config';

create function public.customer_account_candidate(actor uuid, target uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare result jsonb;
begin
  if auth.role() is distinct from 'service_role'
    or not exists(select 1 from public.catalogue_admins where user_id = actor) then
    raise exception 'Catalogue admin access required.';
  end if;
  if target = actor or exists(select 1 from public.catalogue_admins where user_id = target) then
    raise exception 'Admin accounts cannot be disabled from customer management.';
  end if;
  select jsonb_build_object('id', u.id, 'suspended', coalesce(u.banned_until > now(), false))
  into result from auth.users u where u.id = target and not coalesce(u.is_anonymous, false)
    and (exists(select 1 from public.customer_profiles where user_id = u.id)
      or exists(select 1 from public.pending_customer_signups where user_id = u.id and expires_at > now()));
  if result is null then raise exception 'Registered customer account not found.'; end if;
  return result;
end $$;
revoke all on function public.customer_account_candidate(uuid, uuid) from public, anon, authenticated;
grant execute on function public.customer_account_candidate(uuid, uuid) to service_role;

create function public.protect_admin_account_suspension()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_table_name = 'users' then
    if new.banned_until > now() and exists(select 1 from public.catalogue_admins where user_id = new.id) then
      raise exception 'Admin accounts cannot be suspended from customer management.';
    end if;
    if new.banned_until > now() then
      insert into public.customer_account_security(user_id, sessions_revoked_at) values(new.id, clock_timestamp())
      on conflict(user_id) do update set sessions_revoked_at = excluded.sessions_revoked_at;
      delete from auth.refresh_tokens where user_id = new.id::text;
      delete from auth.sessions where user_id = new.id;
    end if;
  else
    perform 1 from auth.users where id = new.user_id for update;
    if exists(select 1 from auth.users where id = new.user_id and banned_until > now()) then
      raise exception 'Restore this account before granting admin access.';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.protect_admin_account_suspension() from public, anon, authenticated;
create trigger protect_admin_auth_ban before update of banned_until on auth.users
for each row execute function public.protect_admin_account_suspension();
create trigger protect_suspended_admin_membership before insert or update of user_id on public.catalogue_admins
for each row execute function public.protect_admin_account_suspension();

create or replace function public.get_admin_customer_summary(page_offset integer default 0)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare result jsonb;
begin
  if not public.is_catalogue_admin() then raise exception 'Only catalogue admins can view registered customers.'; end if;
  if page_offset is null or page_offset < 0 then raise exception 'Invalid customer page.'; end if;
  with customers as (
    select u.id, coalesce(p.email, s.email) as email, coalesce(p.details, s.details) as details,
      coalesce(p.activated_at, u.created_at) as registered_at, u.last_sign_in_at,
      (u.email_confirmed_at is not null and not coalesce(u.is_anonymous, false)) as verified,
      coalesce(u.banned_until > now(), false) as suspended,
      not exists(select 1 from public.catalogue_admins where user_id = u.id) as can_manage_account,
      w.sent_at as welcome_sent_at,
      case when w.sent_at is not null then 'sent' when w.last_error is not null then 'retrying'
        when w.user_id is not null then 'pending' else 'not_queued' end as welcome_status
    from auth.users u
    left join public.customer_profiles p on p.user_id = u.id
    left join public.pending_customer_signups s on s.user_id = u.id and s.expires_at > now()
    left join public.customer_welcome_emails w on w.user_id = u.id
    where p.user_id is not null or s.user_id is not null
  ), page as (
    select * from customers order by registered_at desc, id desc limit 50 offset page_offset
  )
  select jsonb_build_object(
    'total', (select count(*) from customers), 'verified', (select count(*) from customers where verified),
    'pendingActivation', (select count(*) from customers where not verified),
    'welcomeEmailsSent', (select count(*) from customers where welcome_sent_at is not null),
    'customers', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'email', email, 'name', details->>'name', 'phone', details->>'phone',
      'city', details->>'city', 'pincode', details->>'pincode', 'registeredAt', registered_at,
      'lastSignInAt', last_sign_in_at, 'verified', verified, 'welcomeStatus', welcome_status,
      'suspended', suspended, 'canManageAccount', can_manage_account
    ) order by registered_at desc, id desc) from page), '[]'::jsonb)
  ) into result;
  return result;
end $$;
