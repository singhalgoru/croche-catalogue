create or replace function public.revoke_artisan_invitation(invitation_id uuid)
returns uuid language plpgsql security definer set search_path=''
as $$
declare removed_id uuid;
begin
  if not public.is_catalogue_admin() then raise exception 'Verified admin access required.'; end if;
  delete from public.artisan_invitations i
    where i.id=invitation_id and i.submitted_at is null
      and not exists(select 1 from public.artisan_applications a where a.invitation_id=i.id)
    returning i.id into removed_id;
  if removed_id is null then raise exception 'Invitation not found or already submitted.'; end if;
  return removed_id;
end $$;
revoke all on function public.revoke_artisan_invitation(uuid) from public,anon;
grant execute on function public.revoke_artisan_invitation(uuid) to authenticated;

create function public.purge_expired_artisan_invitations()
returns integer language plpgsql security definer set search_path=''
as $$
declare removed_count integer;
begin
  delete from public.artisan_invitations i
    where i.submitted_at is null
      and (i.revoked_at is not null or i.expires_at<=now())
      and not exists(select 1 from public.artisan_applications a where a.invitation_id=i.id);
  get diagnostics removed_count=row_count;
  return removed_count;
end $$;
revoke all on function public.purge_expired_artisan_invitations() from public,anon,authenticated;
grant execute on function public.purge_expired_artisan_invitations() to service_role;

select cron.schedule('purge-revoked-expired-artisan-invitations','*/15 * * * *',
  $job$select public.purge_expired_artisan_invitations();$job$);
