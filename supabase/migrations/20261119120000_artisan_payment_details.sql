create table public.artisan_payment_details (
  application_id uuid primary key references public.artisan_applications(id) on delete cascade,
  encrypted_details bytea not null,
  verified_at timestamptz,
  consent_source text not null check(consent_source in ('artisan','admin')),
  consent_version text not null,
  consented_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.artisan_payment_details enable row level security;
revoke all on public.artisan_payment_details from public,anon,authenticated;
grant all on public.artisan_payment_details to service_role;

create table public.artisan_payment_requests (
  application_id uuid primary key references public.artisan_applications(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  submitted_at timestamptz
);
alter table public.artisan_payment_requests enable row level security;
revoke all on public.artisan_payment_requests from public,anon,authenticated;
grant all on public.artisan_payment_requests to service_role;

alter table public.artisan_application_emails drop constraint artisan_application_emails_kind_check;
alter table public.artisan_application_emails add constraint artisan_application_emails_kind_check
  check(kind in ('submitted','Trial','Approved','Declined','More information required','Payment details required'));

create or replace function public.artisan_payment_key()
returns text language plpgsql security definer set search_path=''
as $$
declare result text;
begin
  select decrypted_secret into result from vault.decrypted_secrets where name='artisan_payment_encryption_key';
  if result is null or length(result)<64 then raise exception 'Payment detail encryption is not configured.'; end if;
  return result;
end $$;
revoke all on function public.artisan_payment_key() from public,anon,authenticated;

create function public.validate_artisan_payment_details(details jsonb)
returns jsonb language plpgsql immutable set search_path=''
as $$
declare name text:=btrim(details->>'name'); method text:=details->>'method';
  upi text:=lower(btrim(details->>'upi')); account text:=btrim(details->>'account');
  ifsc text:=upper(btrim(details->>'ifsc'));
begin
  if jsonb_typeof(details) is distinct from 'object' or octet_length(details::text)>2048
    or jsonb_typeof(details->'name') is distinct from 'string' or jsonb_typeof(details->'method') is distinct from 'string'
    or name is null or length(name) not between 2 and 100
    or name ~ '[[:cntrl:]]' or method is null or method not in ('UPI','Bank transfer') then
    raise exception 'Enter the account holder name and a valid payment method.';
  end if;
  if method='UPI' then
    if jsonb_typeof(details->'upi') is distinct from 'string' or upi is null or length(upi)>100
      or upi !~ '^[a-z0-9._-]{2,}@[a-z0-9.-]{2,}$' then
      raise exception 'Enter a valid UPI ID.';
    end if;
    return jsonb_build_object('name',name,'method',method,'upi',upi);
  end if;
  if jsonb_typeof(details->'account') is distinct from 'string' or jsonb_typeof(details->'ifsc') is distinct from 'string'
    or account is null or account !~ '^[0-9]{6,34}$' or ifsc is null or ifsc !~ '^[A-Z]{4}0[A-Z0-9]{6}$' then
    raise exception 'Enter a valid account number and IFSC.';
  end if;
  return jsonb_build_object('name',name,'method',method,'account',account,'ifsc',ifsc);
end $$;
revoke all on function public.validate_artisan_payment_details(jsonb) from public,anon,authenticated;

create function public.request_artisan_payment_details(application_id uuid)
returns uuid language plpgsql security definer set search_path=''
as $$
declare app public.artisan_applications; raw_token text; request_id uuid:=gen_random_uuid();
begin
  if not public.is_catalogue_admin() then raise exception 'Verified admin access required.'; end if;
  select * into app from public.artisan_applications a where a.id=request_artisan_payment_details.application_id for update;
  if not found or app.contact_email is null then raise exception 'An application email is required to send the request.'; end if;
  if app.status in ('Trial','Approved','Declined','Inactive') then raise exception 'Payment requests are only available before Trial.'; end if;
  if exists(select 1 from public.artisan_payment_details d where d.application_id=app.id and d.verified_at is not null) then
    raise exception 'Verified payment details already exist.';
  end if;
  if exists(select 1 from public.artisan_payment_requests r where r.application_id=app.id and r.expires_at>now() and r.submitted_at is null) then
    raise exception 'A payment request is already active. Wait for it to expire before sending another.';
  end if;
  perform public.artisan_payment_key();
  update public.artisan_application_emails set attempts=8,last_error='Payment request expired or replaced.',
    payload=payload-'payment_token'
    where artisan_application_emails.application_id=app.id and kind='Payment details required' and accepted_at is null;
  raw_token:=encode(extensions.gen_random_bytes(32),'hex');
  insert into public.artisan_payment_requests(application_id,token_hash,expires_at,submitted_at)
    values(app.id,encode(extensions.digest(raw_token,'sha256'),'hex'),now()+interval '24 hours',null)
    on conflict on constraint artisan_payment_requests_pkey do update set token_hash=excluded.token_hash,expires_at=excluded.expires_at,submitted_at=null;
  insert into public.artisan_application_emails(application_id,event_key,kind,recipient_email,payload)
    values(app.id,'payment:'||request_id::text,'Payment details required',app.contact_email,
      jsonb_build_object('application_id',app.id,'applicant_name',app.details->>'fullName','applicant_email',app.contact_email,
        'mobile',app.details->>'mobile','city',app.details->>'city','state',app.details->>'state',
        'skills',app.details->>'skills','availability',app.details->>'availability','message','','payment_token',raw_token,
        'payment_expires_at',now()+interval '24 hours'));
  insert into public.artisan_application_history(application_id,actor_id,action,new_status)
    values(app.id,auth.uid(),'Payment details requested',app.status);
  return request_id;
end $$;
revoke all on function public.request_artisan_payment_details(uuid) from public,anon;
grant execute on function public.request_artisan_payment_details(uuid) to authenticated;

create function public.submit_artisan_payment_details(token text,details jsonb,consent boolean)
returns boolean language plpgsql security definer set search_path=''
as $$
declare request public.artisan_payment_requests; cleaned jsonb; target uuid; app_status text;
begin
  if token is null or token !~ '^[a-f0-9]{64}$' or consent is distinct from true then
    raise exception 'Payment link is invalid or consent is missing.';
  end if;
  select r.application_id into target from public.artisan_payment_requests r
    where r.token_hash=encode(extensions.digest(token,'sha256'),'hex');
  if not found then raise exception 'Payment link is invalid, expired or already used.'; end if;
  select a.status into app_status from public.artisan_applications a where a.id=target for update;
  select * into request from public.artisan_payment_requests r
    where r.token_hash=encode(extensions.digest(token,'sha256'),'hex') for update;
  if not found or request.expires_at<=now() or request.submitted_at is not null
    or app_status in ('Trial','Approved','Declined','Inactive') then
    raise exception 'Payment link is invalid, expired or already used.';
  end if;
  cleaned:=public.validate_artisan_payment_details(details);
  insert into public.artisan_payment_details(application_id,encrypted_details,verified_at,consent_source,consent_version)
    values(request.application_id,extensions.pgp_sym_encrypt(cleaned::text,public.artisan_payment_key()),null,'artisan','2026-11-19.1')
    on conflict on constraint artisan_payment_details_pkey do update set encrypted_details=excluded.encrypted_details,verified_at=null,
      consent_source=excluded.consent_source,consent_version=excluded.consent_version,consented_at=now(),updated_at=now();
  update public.artisan_payment_requests set submitted_at=now() where application_id=request.application_id;
  insert into public.artisan_application_history(application_id,action,new_status)
    select request.application_id,'Payment details submitted',status from public.artisan_applications where id=request.application_id;
  return true;
end $$;
revoke all on function public.submit_artisan_payment_details(text,jsonb,boolean) from public;
grant execute on function public.submit_artisan_payment_details(text,jsonb,boolean) to anon,authenticated;

create function public.artisan_payment_status(application_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
begin
  if not public.is_catalogue_admin() then raise exception 'Verified admin access required.'; end if;
  if not exists(select 1 from public.artisan_applications a where a.id=artisan_payment_status.application_id) then
    raise exception 'Application not found.';
  end if;
  return jsonb_build_object(
    'provided',exists(select 1 from public.artisan_payment_details d where d.application_id=artisan_payment_status.application_id),
    'verified',exists(select 1 from public.artisan_payment_details d where d.application_id=artisan_payment_status.application_id and d.verified_at is not null),
    'requested',exists(select 1 from public.artisan_payment_requests r where r.application_id=artisan_payment_status.application_id
      and r.submitted_at is null and r.expires_at>now()));
end $$;
revoke all on function public.artisan_payment_status(uuid) from public,anon;
grant execute on function public.artisan_payment_status(uuid) to authenticated;

create function public.read_artisan_payment_details(application_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare result public.artisan_payment_details; app_status text;
begin
  if not public.is_catalogue_admin() then raise exception 'Verified admin access required.'; end if;
  select * into result from public.artisan_payment_details d where d.application_id=read_artisan_payment_details.application_id;
  if not found then return null; end if;
  select status into app_status from public.artisan_applications where id=result.application_id;
  insert into public.artisan_application_history(application_id,actor_id,action,new_status)
    values(result.application_id,auth.uid(),'Payment details viewed',app_status);
  return jsonb_build_object('details',extensions.pgp_sym_decrypt(result.encrypted_details,public.artisan_payment_key())::jsonb,
    'verified',result.verified_at is not null);
end $$;
revoke all on function public.read_artisan_payment_details(uuid) from public,anon;
grant execute on function public.read_artisan_payment_details(uuid) to authenticated;

create function public.save_artisan_payment_details(application_id uuid,details jsonb,confirmed boolean)
returns boolean language plpgsql security definer set search_path=''
as $$
declare app public.artisan_applications; cleaned jsonb;
begin
  if not public.is_catalogue_admin() then raise exception 'Verified admin access required.'; end if;
  select * into app from public.artisan_applications a where a.id=save_artisan_payment_details.application_id for update;
  if not found then raise exception 'Application not found.'; end if;
  cleaned:=public.validate_artisan_payment_details(details);
  if confirmed is distinct from true then raise exception 'Confirm that the account is in the artisan''s own name.'; end if;
  if lower(regexp_replace(btrim(cleaned->>'name'), '[[:space:]]+', ' ', 'g'))
    is distinct from lower(regexp_replace(btrim(app.details->>'fullName'), '[[:space:]]+', ' ', 'g')) then
    raise exception 'The account holder name must match the artisan application name.';
  end if;
  insert into public.artisan_payment_details(application_id,encrypted_details,verified_at,consent_source,consent_version)
    values(app.id,extensions.pgp_sym_encrypt(cleaned::text,public.artisan_payment_key()),now(),'admin','2026-11-19.1')
    on conflict on constraint artisan_payment_details_pkey do update set encrypted_details=excluded.encrypted_details,verified_at=now(),
      consent_source=excluded.consent_source,consent_version=excluded.consent_version,consented_at=now(),updated_at=now();
  update public.artisan_payment_requests r set submitted_at=coalesce(r.submitted_at,now()) where r.application_id=app.id;
  update public.artisan_application_emails set attempts=8,last_error='Payment details entered by admin.',
    payload=payload-'payment_token'
    where artisan_application_emails.application_id=app.id and kind='Payment details required' and accepted_at is null;
  insert into public.artisan_application_history(application_id,actor_id,action,new_status)
    values(app.id,auth.uid(),'Payment details saved and name confirmed',app.status);
  return true;
end $$;
revoke all on function public.save_artisan_payment_details(uuid,jsonb,boolean) from public,anon;
grant execute on function public.save_artisan_payment_details(uuid,jsonb,boolean) to authenticated;

create function public.require_artisan_payment_before_trial()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if new.status='Trial' and (tg_op='INSERT' or old.status is distinct from new.status)
    and not exists(select 1 from public.artisan_payment_details d where d.application_id=new.id and d.verified_at is not null) then
    raise exception 'Confirm the artisan''s own payment details before starting Trial.';
  end if;
  return new;
end $$;
revoke all on function public.require_artisan_payment_before_trial() from public,anon,authenticated;
create trigger require_artisan_payment_before_trial before insert or update of status on public.artisan_applications
for each row execute function public.require_artisan_payment_before_trial();
