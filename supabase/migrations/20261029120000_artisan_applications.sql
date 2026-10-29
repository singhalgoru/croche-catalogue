create table public.artisan_invitations (
  id uuid primary key,
  token_hash text not null unique,
  recipient_name text not null check(length(recipient_name) between 1 and 100),
  channel text not null check(channel in ('email','whatsapp')),
  contact text not null check(length(contact) between 1 and 254),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '7 days',
  revoked_at timestamptz,
  submitted_at timestamptz,
  provider_id text,
  email_accepted_at timestamptz
);
alter table public.artisan_invitations enable row level security;
revoke all on public.artisan_invitations from public,anon,authenticated;
grant select(id,recipient_name,channel,contact,created_at,expires_at,revoked_at,submitted_at,email_accepted_at)
  on public.artisan_invitations to authenticated;
grant all on public.artisan_invitations to service_role;
create policy artisan_invitations_admin_read on public.artisan_invitations
for select to authenticated using(public.is_catalogue_admin());

create function public.create_artisan_invitation(invitation_id uuid,invitation_token text,recipient_name text,delivery_channel text,recipient_contact text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare existing public.artisan_invitations; fingerprint text; cleaned_contact text:=btrim(recipient_contact);
begin
  if not public.is_catalogue_admin() then raise exception 'Verified admin access required.'; end if;
  if invitation_id is null or invitation_token is null or invitation_token !~ '^[a-f0-9]{64}$'
    or recipient_name is null or length(btrim(recipient_name)) not between 1 and 100
    or delivery_channel is null or delivery_channel not in ('email','whatsapp')
    or cleaned_contact is null or length(cleaned_contact)>254
    or (delivery_channel='email' and cleaned_contact !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
    or (delivery_channel='whatsapp' and cleaned_contact !~ '^(\+?91[ -]?)?[6-9][0-9]{9}$') then
    raise exception 'Enter a name and a valid invitation email or Indian WhatsApp number.';
  end if;
  if delivery_channel='email' then cleaned_contact:=lower(cleaned_contact); end if;
  fingerprint:=encode(extensions.digest(invitation_token,'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(817266);
  select * into existing from public.artisan_invitations where id=invitation_id;
  if found then
    if existing.created_by is distinct from auth.uid() or existing.token_hash<>fingerprint
      or existing.recipient_name<>btrim(recipient_name) or existing.channel<>delivery_channel or existing.contact<>cleaned_contact
      or existing.revoked_at is not null or existing.submitted_at is not null or existing.expires_at<=now() then
      raise exception 'Invitation changed or is no longer available. Create a new invitation.';
    end if;
    if existing.channel='email' and existing.provider_id is null and existing.created_at<now()-interval '23 hours' then
      raise exception 'Email retry window expired. Revoke this invitation and create a new one.';
    end if;
    return to_jsonb(existing)-'token_hash';
  end if;
  if (select count(*) from public.artisan_invitations where created_at>now()-interval '1 day' and created_by=auth.uid())>=20
    or (select count(*) from public.artisan_invitations where created_at>now()-interval '1 day')>=100 then
    raise exception 'Daily invitation limit reached.';
  end if;
  insert into public.artisan_invitations(id,token_hash,recipient_name,channel,contact,created_by)
    values(invitation_id,fingerprint,btrim(recipient_name),delivery_channel,cleaned_contact,auth.uid())
    returning * into existing;
  return to_jsonb(existing)-'token_hash';
end $$;
revoke all on function public.create_artisan_invitation(uuid,text,text,text,text) from public,anon;
grant execute on function public.create_artisan_invitation(uuid,text,text,text,text) to authenticated;

create function public.revoke_artisan_invitation(invitation_id uuid)
returns uuid language plpgsql security definer set search_path=''
as $$
begin
  if not public.is_catalogue_admin() then raise exception 'Verified admin access required.'; end if;
  update public.artisan_invitations set revoked_at=coalesce(revoked_at,now()) where id=invitation_id and submitted_at is null;
  if not found then raise exception 'Invitation not found or already submitted.'; end if;
  return invitation_id;
end $$;
revoke all on function public.revoke_artisan_invitation(uuid) from public,anon;
grant execute on function public.revoke_artisan_invitation(uuid) to authenticated;

create function public.artisan_invitation_status(invitation_token text)
returns text language plpgsql stable security definer set search_path=''
as $$
declare invitation public.artisan_invitations;
begin
  if invitation_token is null or invitation_token !~ '^[a-f0-9]{64}$' then return 'unavailable'; end if;
  select * into invitation from public.artisan_invitations where token_hash=encode(extensions.digest(invitation_token,'sha256'),'hex');
  if not found or invitation.revoked_at is not null or invitation.expires_at<=now() then return 'unavailable'; end if;
  if invitation.submitted_at is not null then return 'submitted'; end if;
  return 'available';
end $$;
revoke all on function public.artisan_invitation_status(text) from public;
grant execute on function public.artisan_invitation_status(text) to anon,authenticated;

create table public.artisan_applications (
  id uuid primary key,
  invitation_id uuid not null unique references public.artisan_invitations(id),
  user_id uuid references auth.users(id) on delete set null,
  details jsonb not null check(jsonb_typeof(details)='object'),
  consent_version text not null,
  status text not null default 'New' check(status in ('New','Contacted','Trial','Approved','Declined','Inactive')),
  admin_notes text not null default '' check(length(admin_notes)<=3000),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index artisan_applications_owner_date on public.artisan_applications(user_id,created_at);
create index artisan_applications_status_date on public.artisan_applications(status,updated_at);
alter table public.artisan_applications enable row level security;
revoke all on public.artisan_applications from public,anon,authenticated;
grant all on public.artisan_applications to service_role;

create table public.artisan_application_history (
  id bigint generated always as identity primary key,
  application_id uuid not null references public.artisan_applications(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  old_status text,
  new_status text not null,
  created_at timestamptz not null default now()
);
create index artisan_history_application on public.artisan_application_history(application_id,id);
alter table public.artisan_application_history enable row level security;
revoke all on public.artisan_application_history from public,anon,authenticated;
grant select on public.artisan_application_history to authenticated;
grant all on public.artisan_application_history to service_role;
grant usage,select on sequence public.artisan_application_history_id_seq to service_role;
create policy artisan_history_admin_read on public.artisan_application_history
for select to authenticated using(public.is_catalogue_admin());

create function public.submit_artisan_application(request_id uuid,application_details jsonb,privacy_version text,invitation_token text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare
  owner_id uuid:=auth.uid();
  cleaned jsonb:='{}'::jsonb;
  field_name text;
  field_value text;
  max_length integer;
  required_field boolean;
  existing public.artisan_applications;
  invitation public.artisan_invitations;
begin
  if owner_id is null or auth.role() is distinct from 'authenticated' then raise exception 'Application session required.'; end if;
  if request_id is null or jsonb_typeof(application_details) is distinct from 'object'
    or privacy_version is distinct from '2026-10-29' then raise exception 'Use the current application form and privacy notice.'; end if;
  if exists(select 1 from jsonb_object_keys(application_details) k where k not in
    ('fullName','mobile','city','state','pin','language','skills','availability','experience','tools','portfolioUrl','notes','adult','consent','paidTrial')) then
    raise exception 'Unexpected application fields.';
  end if;
  for field_name,max_length,required_field in select * from (values
    ('fullName',100,true),('mobile',20,true),('city',100,true),('state',100,true),('pin',6,true),
    ('language',150,true),('skills',1000,true),('availability',500,true),('experience',500,false),
    ('tools',500,false),('portfolioUrl',500,false),('notes',500,false)
  ) as fields(name,maximum,required) loop
    if jsonb_typeof(application_details->field_name) is distinct from 'string' then raise exception 'Invalid application field: %',field_name; end if;
    field_value:=btrim(application_details->>field_name);
    if length(field_value)>max_length or (required_field and length(field_value)=0) then raise exception 'Check application field: %',field_name; end if;
    cleaned:=cleaned||jsonb_build_object(field_name,field_value);
  end loop;
  if (cleaned->>'mobile') !~ '^(\+?91[ -]?)?[6-9][0-9]{9}$'
    or (cleaned->>'pin') !~ '^[1-9][0-9]{5}$'
    or ((cleaned->>'portfolioUrl')<>'' and (cleaned->>'portfolioUrl') !~ '^https://[^/@[:space:]]+([/?#][^[:space:]]*)?$')
    or (application_details->'adult') is distinct from 'true'::jsonb
    or (application_details->'consent') is distinct from 'true'::jsonb
    or jsonb_typeof(application_details->'paidTrial') is distinct from 'boolean' then
    raise exception 'Check your mobile number, PIN, portfolio link and application confirmations.';
  end if;
  cleaned:=cleaned||jsonb_build_object('adult',true,'consent',true,'paidTrial',application_details->'paidTrial');
  perform pg_catalog.pg_advisory_xact_lock(817265);
  if invitation_token is null or invitation_token !~ '^[a-f0-9]{64}$' then raise exception 'An admin invitation is required.'; end if;
  select * into invitation from public.artisan_invitations
    where token_hash=encode(extensions.digest(invitation_token,'sha256'),'hex') for update;
  if not found then raise exception 'Invitation unavailable. Ask Luvia for a new link.'; end if;
  select * into existing from public.artisan_applications where id=request_id;
  if found then
    if existing.user_id=owner_id and existing.invitation_id=invitation.id and existing.details=cleaned
      and existing.consent_version=privacy_version then return request_id; end if;
    raise exception 'Application request changed. Submit a new application.';
  end if;
  if invitation.revoked_at is not null or invitation.expires_at<=now() or invitation.submitted_at is not null then
    raise exception 'Invitation expired, revoked or already submitted. Contact Luvia before reapplying.';
  end if;
  if exists(select 1 from public.cart_session_blocks where user_id=owner_id) then raise exception 'This session is blocked.'; end if;
  if (select count(*) from public.artisan_applications where user_id=owner_id and created_at>now()-interval '1 day')>=2
    or (select count(*) from public.artisan_applications where created_at>now()-interval '1 day')>=100 then
    raise exception 'Application limit reached. Please try later or contact hello@luviacreations.com.';
  end if;
  insert into public.artisan_applications(id,invitation_id,user_id,details,consent_version)
    values(request_id,invitation.id,owner_id,cleaned,privacy_version);
  update public.artisan_invitations set submitted_at=now() where id=invitation.id;
  insert into public.artisan_application_history(application_id,actor_id,action,new_status)
    values(request_id,owner_id,'Submitted','New');
  return request_id;
end $$;
revoke all on function public.submit_artisan_application(uuid,jsonb,text,text) from public,anon;
grant execute on function public.submit_artisan_application(uuid,jsonb,text,text) to authenticated;

create function public.list_artisan_applications(search_text text default '',status_filter text default '',page_number integer default 0)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare result jsonb; total_count bigint;
begin
  if not public.is_catalogue_admin() then raise exception 'Verified admin access required.'; end if;
  if search_text is null or length(search_text)>100 or page_number is null or page_number<0 or page_number>100000
    or status_filter is null or status_filter not in ('','New','Contacted','Trial','Approved','Declined','Inactive') then
    raise exception 'Invalid artisan directory filter.';
  end if;
  select count(*) into total_count from public.artisan_applications a
    where (status_filter='' or a.status=status_filter)
      and (search_text='' or strpos(lower(concat_ws(' ',a.details->>'fullName',a.details->>'mobile',a.details->>'city',a.details->>'state',a.details->>'skills')),lower(btrim(search_text)))>0);
  select coalesce(jsonb_agg(to_jsonb(matches)-'user_id'),'[]'::jsonb) into result from (
    select a.* from public.artisan_applications a
    where (status_filter='' or a.status=status_filter)
      and (search_text='' or strpos(lower(concat_ws(' ',a.details->>'fullName',a.details->>'mobile',a.details->>'city',a.details->>'state',a.details->>'skills')),lower(btrim(search_text)))>0)
    order by a.created_at desc,a.id limit 25 offset page_number*25
  ) matches;
  return jsonb_build_object('applications',result,'total',total_count);
end $$;
revoke all on function public.list_artisan_applications(text,text,integer) from public,anon;
grant execute on function public.list_artisan_applications(text,text,integer) to authenticated;

create function public.update_artisan_application(application_id uuid,expected_version integer,next_status text,review_notes text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare existing public.artisan_applications; saved public.artisan_applications;
begin
  if not public.is_catalogue_admin() then raise exception 'Verified admin access required.'; end if;
  if next_status is null or next_status not in ('New','Contacted','Trial','Approved','Declined','Inactive')
    or review_notes is null or length(review_notes)>3000 then raise exception 'Check status and review notes (maximum 3,000 characters).'; end if;
  select * into existing from public.artisan_applications where id=application_id for update;
  if not found then raise exception 'Application not found.'; end if;
  if existing.version is distinct from expected_version then raise exception 'Another admin updated this application. Refresh before saving.'; end if;
  update public.artisan_applications set status=next_status,admin_notes=btrim(review_notes),
    version=version+1,updated_at=now() where id=application_id returning * into saved;
  insert into public.artisan_application_history(application_id,actor_id,action,old_status,new_status)
    values(application_id,auth.uid(),'Review updated',existing.status,saved.status);
  return to_jsonb(saved)-'user_id';
end $$;
revoke all on function public.update_artisan_application(uuid,integer,text,text) from public,anon;
grant execute on function public.update_artisan_application(uuid,integer,text,text) to authenticated;

create function public.delete_artisan_application(application_id uuid,expected_version integer)
returns uuid language plpgsql security definer set search_path=''
as $$
declare removed_invitation uuid;
begin
  if not public.is_catalogue_admin() then raise exception 'Verified admin access required.'; end if;
  delete from public.artisan_applications where id=application_id and version=expected_version returning invitation_id into removed_invitation;
  if not found then raise exception 'Application changed or no longer exists. Refresh before deleting.'; end if;
  delete from public.artisan_invitations where id=removed_invitation;
  return application_id;
end $$;
revoke all on function public.delete_artisan_application(uuid,integer) from public,anon;
grant execute on function public.delete_artisan_application(uuid,integer) to authenticated;

select cron.schedule('expire-artisan-applications','41 2 * * *',
  $job$
    delete from public.artisan_applications where status not in ('Approved','Inactive') and updated_at<now()-interval '180 days';
    delete from public.artisan_invitations i where created_at<now()-interval '180 days'
      and not exists(select 1 from public.artisan_applications a where a.invitation_id=i.id);
  $job$);
