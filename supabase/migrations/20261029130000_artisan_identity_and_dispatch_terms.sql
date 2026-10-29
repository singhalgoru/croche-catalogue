alter table public.artisan_invitations alter column expires_at set default now()+interval '24 hours';
update public.artisan_invitations set expires_at=least(expires_at,created_at+interval '24 hours')
where submitted_at is null;

alter table public.artisan_applications
  add column dispatch_terms_version text,
  add column dispatch_terms_accepted_at timestamptz,
  add column identity_type text check(identity_type in ('masked_aadhaar','alternative_id')),
  add column identity_expires_at timestamptz;

create table public.artisan_identity_documents (
  application_id uuid primary key references public.artisan_applications(id) on delete cascade,
  document_type text not null check(document_type in ('masked_aadhaar','alternative_id')),
  content bytea not null check(octet_length(content) between 16 and 1048576),
  content_type text not null check(content_type='image/webp'),
  consent_version text not null,
  consented_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '30 days'
);
alter table public.artisan_identity_documents enable row level security;
revoke all on public.artisan_identity_documents from public,anon,authenticated;
grant all on public.artisan_identity_documents to service_role;

drop function public.submit_artisan_application(uuid,jsonb,text,text);
create function public.submit_artisan_application(request_id uuid,application_details jsonb,privacy_version text,invitation_token text,
  dispatch_terms_version text default null,identity_document jsonb default null)
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
  document_bytes bytea;
  supplied_type text;
begin
  if owner_id is null or auth.role() is distinct from 'authenticated' then raise exception 'Application session required.'; end if;
  if request_id is null or jsonb_typeof(application_details) is distinct from 'object'
    or privacy_version is distinct from '2026-10-29.2' or dispatch_terms_version is distinct from '2026-10-29.1' then
    raise exception 'Use the current application form and acknowledge the privacy and material dispatch terms.';
  end if;
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
  if identity_document is not null then
    if jsonb_typeof(identity_document) is distinct from 'object'
      or (identity_document->>'documentType') is null or (identity_document->>'documentType') not in ('masked_aadhaar','alternative_id')
      or (identity_document->>'contentType') is distinct from 'image/webp'
      or (identity_document->'consent') is distinct from 'true'::jsonb
      or jsonb_typeof(identity_document->'data') is distinct from 'string'
      or length(identity_document->>'data') not between 24 and 1398104
      or (identity_document->>'data') !~ '^[A-Za-z0-9+/]+={0,2}$'
      or exists(select 1 from jsonb_object_keys(identity_document) k where k not in ('documentType','contentType','consent','data')) then
      raise exception 'Provide one prepared ID image and explicit ID verification consent.';
    end if;
    document_bytes:=decode(identity_document->>'data','base64');
    if octet_length(document_bytes) not between 16 and 1048576
      or substring(document_bytes from 1 for 4)<>decode('52494646','hex')
      or substring(document_bytes from 9 for 4)<>decode('57454250','hex') then
      raise exception 'Invalid ID image. Use a JPG, PNG or WebP photo prepared by the application form.';
    end if;
    supplied_type:=identity_document->>'documentType';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(817265);
  if invitation_token is null or invitation_token !~ '^[a-f0-9]{64}$' then raise exception 'An admin invitation is required.'; end if;
  select * into invitation from public.artisan_invitations
    where token_hash=encode(extensions.digest(invitation_token,'sha256'),'hex') for update;
  if not found then raise exception 'Invitation unavailable. Ask Luvia for a new link.'; end if;
  select * into existing from public.artisan_applications where id=request_id;
  if found then
    if existing.user_id=owner_id and existing.invitation_id=invitation.id and existing.details=cleaned
      and existing.consent_version=privacy_version and existing.dispatch_terms_version=dispatch_terms_version
      and existing.identity_type is not distinct from supplied_type
      and (document_bytes is null or exists(select 1 from public.artisan_identity_documents d
        where d.application_id=request_id and d.document_type=supplied_type and d.content=document_bytes)) then return request_id; end if;
    raise exception 'Application request changed. Contact Luvia if this invitation was already submitted.';
  end if;
  if invitation.revoked_at is not null or invitation.expires_at<=now() or invitation.submitted_at is not null then
    raise exception 'Invitation expired, revoked or already submitted. Contact Luvia before reapplying.';
  end if;
  if exists(select 1 from public.cart_session_blocks where user_id=owner_id) then raise exception 'This session is blocked.'; end if;
  if (select count(*) from public.artisan_applications where user_id=owner_id and created_at>now()-interval '1 day')>=2
    or (select count(*) from public.artisan_applications where created_at>now()-interval '1 day')>=100 then
    raise exception 'Application limit reached. Please try later or contact hello@luviacreations.com.';
  end if;
  insert into public.artisan_applications(id,invitation_id,user_id,details,consent_version,
    dispatch_terms_version,dispatch_terms_accepted_at,identity_type,identity_expires_at)
  values(request_id,invitation.id,owner_id,cleaned,privacy_version,dispatch_terms_version,now(),supplied_type,
    case when document_bytes is not null then now()+interval '30 days' end);
  if document_bytes is not null then
    insert into public.artisan_identity_documents(application_id,document_type,content,content_type,consent_version)
      values(request_id,supplied_type,document_bytes,'image/webp',privacy_version);
  end if;
  update public.artisan_invitations set submitted_at=now() where id=invitation.id;
  insert into public.artisan_application_history(application_id,actor_id,action,new_status)
    values(request_id,owner_id,'Submitted','New');
  return request_id;
end $$;
revoke all on function public.submit_artisan_application(uuid,jsonb,text,text,text,jsonb) from public,anon;
grant execute on function public.submit_artisan_application(uuid,jsonb,text,text,text,jsonb) to authenticated;

create function public.read_artisan_identity_document(application_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare document public.artisan_identity_documents; application_status text;
begin
  if not public.is_catalogue_admin() then raise exception 'Verified admin access required.'; end if;
  select * into document from public.artisan_identity_documents d where d.application_id=read_artisan_identity_document.application_id and d.expires_at>now();
  if not found then raise exception 'ID document not available or already expired.'; end if;
  select status into application_status from public.artisan_applications where id=application_id;
  insert into public.artisan_application_history(application_id,actor_id,action,old_status,new_status)
    values(application_id,auth.uid(),'ID viewed',application_status,application_status);
  return jsonb_build_object('documentType',document.document_type,'contentType',document.content_type,
    'data',replace(encode(document.content,'base64'),E'\n',''),'expiresAt',document.expires_at);
end $$;
revoke all on function public.read_artisan_identity_document(uuid) from public,anon;
grant execute on function public.read_artisan_identity_document(uuid) to authenticated;

create function public.remove_artisan_identity_document(application_id uuid,expected_version integer)
returns uuid language plpgsql security definer set search_path=''
as $$
declare application_status text;
begin
  if not public.is_catalogue_admin() then raise exception 'Verified admin access required.'; end if;
  update public.artisan_applications set identity_type=null,identity_expires_at=null,version=version+1
    where id=application_id and version=expected_version returning status into application_status;
  if not found then raise exception 'Application changed. Refresh before removing ID.'; end if;
  delete from public.artisan_identity_documents d where d.application_id=remove_artisan_identity_document.application_id;
  if not found then raise exception 'ID document no longer available. Refresh the application.'; end if;
  insert into public.artisan_application_history(application_id,actor_id,action,old_status,new_status)
    values(application_id,auth.uid(),'ID removed after review',application_status,application_status);
  return application_id;
end $$;
revoke all on function public.remove_artisan_identity_document(uuid,integer) from public,anon;
grant execute on function public.remove_artisan_identity_document(uuid,integer) to authenticated;

create function public.expire_artisan_identity_documents()
returns void language plpgsql security definer set search_path=''
as $$
begin
  with removed as (
    delete from public.artisan_identity_documents where expires_at<=now() returning application_id
  )
  update public.artisan_applications a set identity_type=null,identity_expires_at=null,version=version+1
    from removed where a.id=removed.application_id;
end $$;
revoke all on function public.expire_artisan_identity_documents() from public,anon,authenticated;
grant execute on function public.expire_artisan_identity_documents() to service_role;
select cron.schedule('expire-artisan-identity-documents','11 * * * *',$job$select public.expire_artisan_identity_documents();$job$);
