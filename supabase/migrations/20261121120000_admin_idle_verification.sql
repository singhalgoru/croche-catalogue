create table public.admin_verified_sessions (
  session_id uuid primary key references auth.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  factor_id uuid not null,
  verified_at numeric not null,
  last_activity timestamptz not null default now()
);
alter table public.admin_verified_sessions enable row level security;
revoke all on public.admin_verified_sessions from public, anon, authenticated;
grant all on public.admin_verified_sessions to service_role;

create or replace function public.is_catalogue_admin()
returns boolean language sql stable security definer set search_path=''
as $$
  select coalesce(auth.jwt()->>'aal'='aal2'
    and exists(select 1 from public.catalogue_admins where user_id=auth.uid())
    and exists(select 1 from public.admin_security_settings where id and not locked)
    and exists(
      select 1 from auth.sessions s
      join auth.mfa_factors f on f.id=s.factor_id
      cross join lateral (
        select max((a->>'timestamp')::numeric) as verified_at
        from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]'::jsonb)) a
        where a->>'method'='totp' and (a->>'timestamp')::numeric <= extract(epoch from now())
      ) m
      left join public.admin_verified_sessions v on v.session_id=s.id
      where s.id::text=auth.jwt()->>'session_id' and s.user_id=auth.uid()
        and s.aal='aal2' and (s.not_after is null or s.not_after>now())
        and f.user_id=auth.uid() and f.status='verified' and f.factor_type='totp'
        and m.verified_at is not null
        and (
          (v.user_id=s.user_id and v.factor_id=f.id and v.verified_at=m.verified_at
            and v.last_activity>now()-interval '15 minutes')
          or (m.verified_at >= extract(epoch from now()-interval '15 minutes')
            and (v.session_id is null or m.verified_at>v.verified_at))
        )
    ),false);
$$;

create function public.touch_admin_session()
returns boolean language plpgsql security definer set search_path=''
as $$
declare session_row auth.sessions; verified numeric;
begin
  select s.* into session_row from auth.sessions s
    where s.id::text=auth.jwt()->>'session_id' and s.user_id=auth.uid() for update;
  if not public.is_catalogue_admin() then raise exception 'Verified admin access required.'; end if;
  select max((a->>'timestamp')::numeric) into verified
    from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]'::jsonb)) a
    where a->>'method'='totp' and (a->>'timestamp')::numeric <= extract(epoch from now());
  insert into public.admin_verified_sessions(session_id,user_id,factor_id,verified_at,last_activity)
    values(session_row.id,session_row.user_id,session_row.factor_id,verified,now())
  on conflict (session_id) do update set user_id=excluded.user_id, factor_id=excluded.factor_id,
    verified_at=excluded.verified_at,last_activity=excluded.last_activity;
  return true;
end $$;
revoke all on function public.touch_admin_session() from public,anon;
grant execute on function public.touch_admin_session() to authenticated;
