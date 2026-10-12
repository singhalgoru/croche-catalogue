create table public.admin_security_settings (
  id boolean primary key default true check(id),
  locked boolean not null default false
);
insert into public.admin_security_settings(id) values(true);
alter table public.admin_security_settings enable row level security;
revoke all on public.admin_security_settings from public,anon,authenticated;
grant all on public.admin_security_settings to service_role;

create or replace function public.is_catalogue_admin()
returns boolean language sql stable security definer set search_path=''
as $$
  select coalesce(auth.jwt()->>'aal'='aal2'
    and exists(select 1 from public.catalogue_admins where user_id=auth.uid())
    and exists(select 1 from public.admin_security_settings where id and not locked)
    and exists(
      select 1 from auth.sessions s join auth.mfa_factors f on f.id=s.factor_id
      where s.id::text=auth.jwt()->>'session_id' and s.user_id=auth.uid()
        and s.aal='aal2' and (s.not_after is null or s.not_after>now())
        and f.user_id=auth.uid() and f.status='verified' and f.factor_type='totp'
    )
    and exists(
      select 1 from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]'::jsonb)) a
      where a->>'method'='totp'
        and (a->>'timestamp')::numeric between extract(epoch from now()-interval '15 minutes') and extract(epoch from now())
    ),false);
$$;

create function public.admin_access_status()
returns jsonb language sql stable security definer set search_path=''
as $$
  select jsonb_build_object(
    'isAdmin',exists(select 1 from public.catalogue_admins where user_id=auth.uid()),
    'locked',coalesce((select locked from public.admin_security_settings where id),true),
    'verified',coalesce(public.is_catalogue_admin(),false)
  );
$$;
revoke all on function public.admin_access_status() from public,anon;
grant execute on function public.admin_access_status() to authenticated;

create table public.admin_catalogue_audit (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  session_id text,
  table_name text not null,
  action text not null,
  old_record jsonb,
  new_record jsonb,
  created_at timestamptz not null default now()
);
alter table public.admin_catalogue_audit enable row level security;
revoke all on public.admin_catalogue_audit from public,anon,authenticated;
grant select on public.admin_catalogue_audit to authenticated;
grant all on public.admin_catalogue_audit to service_role;
grant usage,select on sequence public.admin_catalogue_audit_id_seq to service_role;
create policy admin_catalogue_audit_read on public.admin_catalogue_audit
for select to authenticated using(public.is_catalogue_admin());

create function public.audit_catalogue_change()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  insert into public.admin_catalogue_audit(actor_id,session_id,table_name,action,old_record,new_record)
  values(auth.uid(),auth.jwt()->>'session_id',tg_table_name,tg_op,
    case when tg_op<>'INSERT' then to_jsonb(old) end,
    case when tg_op<>'DELETE' then to_jsonb(new) end);
  return null;
end $$;
revoke all on function public.audit_catalogue_change() from public,anon,authenticated;
create trigger audit_product_changes after insert or update or delete on public.products
for each row execute function public.audit_catalogue_change();
create trigger audit_ticker_changes after insert or update or delete on public.ticker_messages
for each row execute function public.audit_catalogue_change();
