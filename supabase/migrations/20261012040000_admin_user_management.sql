alter table public.catalogue_admins add column is_owner boolean not null default false;
do $$ begin
  if (select count(*) from public.catalogue_admins)=1 then
    update public.catalogue_admins set is_owner=true;
  else
    raise exception 'Assign the initial owner explicitly before installing admin management.';
  end if;
end $$;
create unique index catalogue_single_owner on public.catalogue_admins(is_owner) where is_owner;
revoke insert,update,delete on public.catalogue_admins from anon,authenticated;

create table public.admin_user_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id),
  target_id uuid not null references auth.users(id),
  action text not null check(action in ('grant','remove','edit','password')),
  created_at timestamptz not null default now()
);
alter table public.admin_user_audit enable row level security;
revoke all on public.admin_user_audit from anon,authenticated;
grant all on public.admin_user_audit to service_role;

create function public.admin_user_directory(actor uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare owner_access boolean;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Backend access required.'; end if;
  select is_owner into owner_access from public.catalogue_admins where user_id=actor;
  if not found then raise exception 'Catalogue admin access required.'; end if;
  return jsonb_build_object('isOwner',owner_access,'currentUserId',actor,'users',coalesce((
    select jsonb_agg(jsonb_build_object('id',u.id,'email',u.email,
      'name',coalesce(u.raw_user_meta_data->>'full_name',''),'isOwner',a.is_owner,
      'verified',u.email_confirmed_at is not null,'createdAt',a.created_at)
      order by a.is_owner desc,a.created_at,u.id)
    from public.catalogue_admins a join auth.users u on u.id=a.user_id
    where owner_access or a.user_id=actor
  ),'[]'::jsonb));
end $$;

create function public.manage_admin_membership(actor uuid,target uuid,grant_access boolean)
returns void language plpgsql security definer set search_path=''
as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Backend access required.'; end if;
  perform 1 from public.catalogue_admins where user_id=actor and is_owner for update;
  if not found then raise exception 'Only the owner can manage admin access.'; end if;
  if exists(select 1 from public.catalogue_admins where user_id=target and is_owner) then
    raise exception 'Owner access cannot be removed or changed here.';
  end if;
  if not exists(select 1 from auth.users where id=target and email is not null and not coalesce(is_anonymous,false)) then
    raise exception 'A registered email account is required.';
  end if;
  if grant_access then
    insert into public.catalogue_admins(user_id) values(target) on conflict do nothing;
  else
    delete from public.catalogue_admins where user_id=target;
    if not found then raise exception 'Admin user not found.'; end if;
  end if;
  insert into public.admin_user_audit(actor_id,target_id,action)
  values(actor,target,case when grant_access then 'grant' else 'remove' end);
end $$;

create function public.find_admin_candidate(actor uuid,account_email text)
returns uuid language plpgsql stable security definer set search_path=''
as $$
begin
  if auth.role() is distinct from 'service_role' or not exists(
    select 1 from public.catalogue_admins where user_id=actor and is_owner) then
    raise exception 'Owner backend access required.';
  end if;
  return (select id from auth.users where lower(email)=lower(account_email) and not coalesce(is_anonymous,false));
end $$;
revoke all on function public.admin_user_directory(uuid) from public,anon,authenticated;
revoke all on function public.manage_admin_membership(uuid,uuid,boolean) from public,anon,authenticated;
revoke all on function public.find_admin_candidate(uuid,text) from public,anon,authenticated;
grant execute on function public.admin_user_directory(uuid),public.manage_admin_membership(uuid,uuid,boolean),
  public.find_admin_candidate(uuid,text) to service_role;
