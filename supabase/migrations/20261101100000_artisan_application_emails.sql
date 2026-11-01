alter table public.artisan_applications
  add column contact_email text check(contact_email is null or (length(contact_email)<=254 and contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
  add column applicant_message text not null default '' check(length(applicant_message)<=1500);

alter table public.artisan_applications drop constraint artisan_applications_status_check;
alter table public.artisan_applications add constraint artisan_applications_status_check
  check(status in ('New','Contacted','Trial','More information required','Approved','Declined','Inactive'));

drop function public.submit_artisan_application(uuid,jsonb,text,text,text,jsonb,jsonb);
create function public.submit_artisan_application(request_id uuid,application_details jsonb,privacy_version text,invitation_token text,
  dispatch_terms_version text default null,identity_document jsonb default null,profile_photo jsonb default null,
  applicant_email text default null)
returns uuid language plpgsql security definer set search_path=''
as $$
declare address text:=coalesce(application_details->>'address','');
  email text:=lower(btrim(applicant_email));
  photo bytea;
  existed boolean;
  result uuid;
  existing public.artisan_applications;
begin
  if request_id is null or privacy_version is null or privacy_version not in ('2026-11-01.1','2026-10-29.2')
    or (privacy_version='2026-11-01.1' and (email is null or length(email)>254 or email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'))
    or (privacy_version='2026-10-29.2' and applicant_email is not null)
    or application_details ? 'email' then
    raise exception 'Enter a valid email address and use the current application privacy notice.';
  end if;
  if application_details ? 'address' and jsonb_typeof(application_details->'address') is distinct from 'string' then
    raise exception 'Enter a valid delivery address.';
  end if;
  if length(btrim(address))>1000 then raise exception 'Delivery address must be at most 1,000 characters.'; end if;
  if profile_photo is not null then
    if jsonb_typeof(profile_photo) is distinct from 'object' or profile_photo->>'contentType' is distinct from 'image/webp'
      or profile_photo->'consent' is distinct from 'true'::jsonb or profile_photo->>'consentVersion' is distinct from '2026-10-30.1'
      or jsonb_typeof(profile_photo->'data') is distinct from 'string'
      or length(profile_photo->>'data') not between 24 and 1398104
      or profile_photo->>'data' !~ '^[A-Za-z0-9+/]+={0,2}$'
      or exists(select 1 from jsonb_object_keys(profile_photo) k where k not in ('contentType','consent','consentVersion','data')) then
      raise exception 'Provide a prepared profile photo with separate consent.';
    end if;
    photo:=decode(profile_photo->>'data','base64');
    if octet_length(photo) not between 16 and 1048576 or substring(photo from 1 for 4)<>decode('52494646','hex')
      or substring(photo from 9 for 4)<>decode('57454250','hex') then raise exception 'Invalid profile photo.'; end if;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(817265);
  select * into existing from public.artisan_applications where id=request_id for update;
  existed:=found;
  if existed and existing.contact_email is not null and existing.contact_email<>email then
    raise exception 'Application request changed. Contact Luvia for corrections.';
  end if;
  if existed and existing.consent_version='2026-11-01.1' then
    update public.artisan_applications set consent_version='2026-10-29.2' where id=request_id;
  end if;
  result:=public.submit_artisan_application_core(request_id,application_details-'address','2026-10-29.2',invitation_token,
    dispatch_terms_version,identity_document);
  if existed then
    if not exists(select 1 from public.artisan_applications where id=result and delivery_address=btrim(address))
      or (photo is null and exists(select 1 from public.artisan_profile_photos where application_id=result))
      or (photo is not null and not exists(select 1 from public.artisan_profile_photos where application_id=result and content=photo)) then
      raise exception 'Application request changed. Contact Luvia for corrections.';
    end if;
  elsif photo is not null then
    insert into public.artisan_profile_photos(application_id,content) values(result,photo);
  end if;
  update public.artisan_applications set delivery_address=btrim(address),has_profile_photo=photo is not null,
    contact_email=email,consent_version=privacy_version where id=result;
  update public.artisan_identity_documents set consent_version=privacy_version where application_id=result;
  insert into public.artisan_application_emails(application_id,event_key,kind,recipient_email,payload)
    select id,'submitted','submitted','info@luviacreations.com',jsonb_build_object(
      'application_id',id,'applicant_name',details->>'fullName','applicant_email',coalesce(contact_email,''),
      'mobile',details->>'mobile','city',details->>'city','state',details->>'state',
      'skills',details->>'skills','availability',details->>'availability','message',applicant_message)
    from public.artisan_applications where id=result
    on conflict(application_id,event_key) do update set payload=excluded.payload;
  return result;
end $$;
revoke all on function public.submit_artisan_application(uuid,jsonb,text,text,text,jsonb,jsonb,text) from public,anon;
grant execute on function public.submit_artisan_application(uuid,jsonb,text,text,text,jsonb,jsonb,text) to authenticated;

drop function public.list_artisan_applications(text,text,integer,text,integer);
create function public.list_artisan_applications(search_text text default '',status_filter text default '',page_number integer default 0,
  skill_filter text default '',minimum_rating integer default null)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare result jsonb; total_count bigint;
begin
  if not public.is_catalogue_admin() then raise exception 'Verified admin access required.'; end if;
  if search_text is null or length(search_text)>100 or skill_filter is null or length(skill_filter)>100
    or status_filter is null or status_filter not in ('','New','Contacted','Trial','More information required','Approved','Declined','Inactive')
    or page_number is null or page_number<0 or page_number>100000
    or (minimum_rating is not null and minimum_rating not between 1 and 5) then raise exception 'Check artisan filters.'; end if;
  with matches as (
    select a.* from public.artisan_applications a
    where (status_filter='' or a.status=status_filter)
      and (minimum_rating is null or a.skill_rating>=minimum_rating)
      and (skill_filter='' or strpos(lower(concat_ws(' ',a.details->>'skills',a.capabilities)),lower(btrim(skill_filter)))>0)
      and (search_text='' or strpos(lower(concat_ws(' ',a.details->>'fullName',a.details->>'mobile',a.details->>'city',
        a.details->>'state',a.details->>'skills',a.capabilities,a.contact_email)),lower(btrim(search_text)))>0)
  ), paged as (select * from matches order by created_at desc,id limit 25 offset page_number*25)
  select (select count(*) from matches),coalesce((select jsonb_agg(to_jsonb(paged)-'user_id' order by created_at desc,id) from paged),'[]'::jsonb)
    into total_count,result;
  return jsonb_build_object('applications',result,'total',total_count);
end $$;
revoke all on function public.list_artisan_applications(text,text,integer,text,integer) from public,anon;
grant execute on function public.list_artisan_applications(text,text,integer,text,integer) to authenticated;

drop function public.update_artisan_application(uuid,integer,text,text);
create function public.update_artisan_application(application_id uuid,expected_version integer,next_status text,review_notes text,
  applicant_message text default '')
returns jsonb language plpgsql security definer set search_path=''
as $$
declare existing public.artisan_applications; saved public.artisan_applications;
begin
  if not public.is_catalogue_admin() then raise exception 'Verified admin access required.'; end if;
  if next_status is null or next_status not in ('New','Contacted','Trial','More information required','Approved','Declined','Inactive')
    or review_notes is null or length(review_notes)>3000 or applicant_message is null or length(applicant_message)>1500
    or (next_status='More information required' and length(btrim(applicant_message))=0) then
    raise exception 'Check the review status, internal notes and any message to the artisan (maximum 1,500 characters).';
  end if;
  select * into existing from public.artisan_applications where id=application_id for update;
  if not found then raise exception 'Application not found.'; end if;
  if existing.version is distinct from expected_version then raise exception 'Another admin updated this application. Refresh before saving.'; end if;
  update public.artisan_applications set status=next_status,admin_notes=btrim(review_notes),applicant_message=btrim($5),
    version=version+1,updated_at=now() where id=application_id returning * into saved;
  insert into public.artisan_application_history(application_id,actor_id,action,old_status,new_status)
    values(application_id,auth.uid(),'Review updated',existing.status,saved.status);
  return to_jsonb(saved)-'user_id';
end $$;
revoke all on function public.update_artisan_application(uuid,integer,text,text,text) from public,anon;
grant execute on function public.update_artisan_application(uuid,integer,text,text,text) to authenticated;

create table public.artisan_application_emails (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.artisan_applications(id) on delete cascade,
  event_key text not null,
  kind text not null check(kind in ('submitted','Approved','Declined','More information required')),
  recipient_email text not null check(length(recipient_email)<=254 and recipient_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  payload jsonb not null check(jsonb_typeof(payload)='object'),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  accepted_at timestamptz,
  provider_id text,
  last_error text,
  created_at timestamptz not null default now(),
  unique(application_id,event_key)
);
create index artisan_application_emails_due on public.artisan_application_emails(next_attempt_at)
  where accepted_at is null and attempts<8;
alter table public.artisan_application_emails enable row level security;
revoke all on public.artisan_application_emails from public,anon,authenticated;
grant all on public.artisan_application_emails to service_role;

create function public.enqueue_artisan_application_emails()
returns trigger language plpgsql security definer set search_path=''
as $$
declare payload jsonb;
begin
  payload:=jsonb_build_object(
    'application_id',new.id,
    'applicant_name',new.details->>'fullName',
    'applicant_email',new.contact_email,
    'mobile',new.details->>'mobile',
    'city',new.details->>'city',
    'state',new.details->>'state',
    'skills',new.details->>'skills',
    'availability',new.details->>'availability',
    'message',new.applicant_message
  );
  if tg_op='UPDATE' and old.contact_email is distinct from new.contact_email and new.contact_email is not null then
    insert into public.artisan_application_emails(application_id,event_key,kind,recipient_email,payload)
      values(new.id,'submitted','submitted','info@luviacreations.com',payload)
      on conflict(application_id,event_key) do nothing;
  end if;
  if tg_op='UPDATE' and (old.status is distinct from new.status
      or (new.status='More information required' and old.applicant_message is distinct from new.applicant_message))
    and new.status in ('More information required','Approved','Declined') and new.contact_email is not null then
    insert into public.artisan_application_emails(application_id,event_key,kind,recipient_email,payload)
      values(new.id,'status:'||new.version,new.status,new.contact_email,payload)
      on conflict(application_id,event_key) do nothing;
  end if;
  return new;
end $$;
revoke all on function public.enqueue_artisan_application_emails() from public,anon,authenticated;
create trigger enqueue_artisan_application_emails after update of contact_email,status,applicant_message on public.artisan_applications
for each row execute function public.enqueue_artisan_application_emails();

create function public.claim_artisan_application_emails()
returns setof public.artisan_application_emails language plpgsql security definer set search_path=''
as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Backend access required.'; end if;
  return query with due as (
    select e.id from public.artisan_application_emails e
    where e.accepted_at is null and e.next_attempt_at<=now() and e.attempts<8
    order by e.next_attempt_at for update skip locked limit 10
  )
  update public.artisan_application_emails e set attempts=e.attempts+1,next_attempt_at=now()+interval '15 minutes'
  from due where e.id=due.id returning e.*;
end $$;
revoke all on function public.claim_artisan_application_emails() from public,anon,authenticated;
grant execute on function public.claim_artisan_application_emails() to service_role;

create function public.dispatch_artisan_application_emails()
returns void language plpgsql security definer set search_path=''
as $$
declare worker_secret text;
begin
  if not exists(select 1 from public.artisan_application_emails where accepted_at is null and next_attempt_at<=now() and attempts<8) then return; end if;
  select decrypted_secret into worker_secret from vault.decrypted_secrets where name='customer_welcome_worker_secret';
  if worker_secret is null then raise log 'Artisan email worker secret is missing; notifications remain queued.'; return; end if;
  perform net.http_post(
    url:='https://bblsjcjypdxntzlszliy.supabase.co/functions/v1/artisan-application-email-worker',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||worker_secret),
    body:='{}'::jsonb,timeout_milliseconds:=1000);
end $$;
revoke all on function public.dispatch_artisan_application_emails() from public,anon,authenticated;
select cron.schedule('send-artisan-application-emails','* * * * *',
  $job$select public.dispatch_artisan_application_emails();$job$);
select cron.schedule('expire-artisan-application-emails','41 2 * * *',
  $job$delete from public.artisan_application_emails where created_at<now()-interval '30 days' and (accepted_at is not null or attempts>=8);$job$);
