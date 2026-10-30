alter table public.artisan_applications
  add column delivery_address text not null default '' check(length(delivery_address)<=1000),
  add column skill_rating integer check(skill_rating between 1 and 5),
  add column capabilities text not null default '' check(length(capabilities)<=2000),
  add column has_profile_photo boolean not null default false;

create table public.artisan_profile_photos (
  application_id uuid primary key references public.artisan_applications(id) on delete cascade,
  content bytea not null check(octet_length(content) between 16 and 1048576),
  consent_version text not null default '2026-10-30.1',
  created_at timestamptz not null default now()
);
create table public.artisan_comments (
  id uuid primary key,
  application_id uuid not null references public.artisan_applications(id) on delete cascade,
  body text not null check(length(btrim(body)) between 1 and 3000),
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table public.artisan_payments (
  id uuid primary key,
  application_id uuid not null references public.artisan_applications(id) on delete restrict,
  paid_on date not null,
  amount numeric(12,2) not null check(amount>0 and amount<=10000000),
  method text not null check(method in ('UPI','Bank transfer','Cash','Other')),
  reference text not null check(length(reference)<=200),
  description text not null check(length(btrim(description)) between 1 and 1000),
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  void_reason text check(length(btrim(void_reason)) between 1 and 500),
  voided_by uuid references auth.users(id) on delete set null,
  check((voided_at is null and void_reason is null and voided_by is null) or (voided_at is not null and void_reason is not null))
);
create index artisan_comments_application on public.artisan_comments(application_id,created_at);
create index artisan_payments_application on public.artisan_payments(application_id,paid_on);
alter table public.artisan_profile_photos enable row level security;
alter table public.artisan_comments enable row level security;
alter table public.artisan_payments enable row level security;
revoke all on public.artisan_profile_photos,public.artisan_comments,public.artisan_payments from public,anon,authenticated;
grant all on public.artisan_profile_photos,public.artisan_comments,public.artisan_payments to service_role;

alter function public.submit_artisan_application(uuid,jsonb,text,text,text,jsonb) rename to submit_artisan_application_core;
revoke all on function public.submit_artisan_application_core(uuid,jsonb,text,text,text,jsonb) from public,anon,authenticated;
create function public.submit_artisan_application(request_id uuid,application_details jsonb,privacy_version text,invitation_token text,
  dispatch_terms_version text default null,identity_document jsonb default null,profile_photo jsonb default null)
returns uuid language plpgsql security definer set search_path=''
as $$
declare address text:=coalesce(application_details->>'address',''); photo bytea; existed boolean; result uuid;
begin
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
  existed:=exists(select 1 from public.artisan_applications where id=request_id);
  result:=public.submit_artisan_application_core(request_id,application_details-'address',privacy_version,invitation_token,
    dispatch_terms_version,identity_document);
  if existed then
    if not exists(select 1 from public.artisan_applications where id=result and delivery_address=btrim(address))
      or (photo is null and exists(select 1 from public.artisan_profile_photos where application_id=result))
      or (photo is not null and not exists(select 1 from public.artisan_profile_photos where application_id=result and content=photo)) then
      raise exception 'Application request changed. Contact Luvia for corrections.';
    end if;
  else
    update public.artisan_applications set delivery_address=btrim(address),has_profile_photo=photo is not null where id=result;
    if photo is not null then insert into public.artisan_profile_photos(application_id,content) values(result,photo); end if;
  end if;
  return result;
end $$;
revoke all on function public.submit_artisan_application(uuid,jsonb,text,text,text,jsonb,jsonb) from public,anon;
grant execute on function public.submit_artisan_application(uuid,jsonb,text,text,text,jsonb,jsonb) to authenticated;

drop function public.list_artisan_applications(text,text,integer);
create function public.list_artisan_applications(search_text text default '',status_filter text default '',page_number integer default 0,
  skill_filter text default '',minimum_rating integer default null)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare result jsonb; total_count bigint;
begin
  if not public.is_catalogue_admin() then raise exception 'Verified admin access required.'; end if;
  if search_text is null or length(search_text)>100 or skill_filter is null or length(skill_filter)>100
    or status_filter is null or status_filter not in ('','New','Contacted','Trial','Approved','Declined','Inactive')
    or page_number is null or page_number<0 or page_number>100000
    or (minimum_rating is not null and minimum_rating not between 1 and 5) then raise exception 'Check artisan filters.'; end if;
  with matches as (
    select a.* from public.artisan_applications a
    where (status_filter='' or a.status=status_filter)
      and (minimum_rating is null or a.skill_rating>=minimum_rating)
      and (skill_filter='' or strpos(lower(concat_ws(' ',a.details->>'skills',a.capabilities)),lower(btrim(skill_filter)))>0)
      and (search_text='' or strpos(lower(concat_ws(' ',a.details->>'fullName',a.details->>'mobile',a.details->>'city',
        a.details->>'state',a.details->>'skills',a.capabilities)),lower(btrim(search_text)))>0)
  ), paged as (select * from matches order by created_at desc,id limit 25 offset page_number*25)
  select (select count(*) from matches),coalesce((select jsonb_agg(to_jsonb(paged)-'user_id' order by created_at desc,id) from paged),'[]'::jsonb)
    into total_count,result;
  return jsonb_build_object('applications',result,'total',total_count);
end $$;
revoke all on function public.list_artisan_applications(text,text,integer,text,integer) from public,anon;
grant execute on function public.list_artisan_applications(text,text,integer,text,integer) to authenticated;

create function public.save_artisan_skills(application_id uuid,expected_version integer,rating integer,can_create text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare saved public.artisan_applications;
begin
  if not public.is_catalogue_admin() then raise exception 'Verified admin access required.'; end if;
  if (rating is not null and rating not between 1 and 5) or can_create is null or length(can_create)>2000 then
    raise exception 'Use a skill rating from 1 to 5 and capabilities up to 2,000 characters.'; end if;
  update public.artisan_applications set skill_rating=rating,capabilities=btrim(can_create),version=version+1,updated_at=now()
    where id=application_id and version=expected_version returning * into saved;
  if not found then raise exception 'Application changed or no longer exists. Refresh before saving.'; end if;
  insert into public.artisan_application_history(application_id,actor_id,action,new_status)
    values(application_id,auth.uid(),'Skills and rating updated',saved.status);
  return to_jsonb(saved)-'user_id';
end $$;
revoke all on function public.save_artisan_skills(uuid,integer,integer,text) from public,anon;
grant execute on function public.save_artisan_skills(uuid,integer,integer,text) to authenticated;

create function public.artisan_activity(application_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
begin
  if not public.is_catalogue_admin() then raise exception 'Verified admin access required.'; end if;
  if not exists(select 1 from public.artisan_applications where id=application_id) then raise exception 'Artisan not found.'; end if;
  return jsonb_build_object(
    'comments',coalesce((select jsonb_agg(to_jsonb(c)-'actor_id' order by c.created_at desc,c.id) from public.artisan_comments c where c.application_id=$1),'[]'::jsonb),
    'payments',coalesce((select jsonb_agg(to_jsonb(p)-'actor_id'-'voided_by' order by p.paid_on desc,p.created_at desc,p.id) from public.artisan_payments p where p.application_id=$1),'[]'::jsonb));
end $$;
revoke all on function public.artisan_activity(uuid) from public,anon;
grant execute on function public.artisan_activity(uuid) to authenticated;

create function public.add_artisan_comment(application_id uuid,request_id uuid,comment_body text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare previous public.artisan_comments; state text;
begin
  if not public.is_catalogue_admin() then raise exception 'Verified admin access required.'; end if;
  if request_id is null or comment_body is null or length(btrim(comment_body)) not between 1 and 3000 then raise exception 'Enter a comment up to 3,000 characters.'; end if;
  select status into state from public.artisan_applications where id=application_id for update;
  if not found then raise exception 'Artisan not found.'; end if;
  select * into previous from public.artisan_comments where id=request_id;
  if found then
    if previous.application_id=application_id and previous.body=btrim(comment_body) and previous.actor_id=auth.uid() then return request_id; end if;
    raise exception 'Comment request changed. Refresh before retrying.';
  end if;
  insert into public.artisan_comments(id,application_id,body,actor_id) values(request_id,application_id,btrim(comment_body),auth.uid());
  insert into public.artisan_application_history(application_id,actor_id,action,new_status)
    values(application_id,auth.uid(),'Comment added',state);
  return request_id;
end $$;
revoke all on function public.add_artisan_comment(uuid,uuid,text) from public,anon;
grant execute on function public.add_artisan_comment(uuid,uuid,text) to authenticated;

create function public.record_artisan_payment(application_id uuid,request_id uuid,payment_date date,payment_amount numeric,
  payment_method text,payment_reference text,payment_description text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare previous public.artisan_payments; state text;
begin
  if not public.is_catalogue_admin() then raise exception 'Verified admin access required.'; end if;
  if request_id is null or payment_date is null or payment_date>(now() at time zone 'Asia/Kolkata')::date or payment_date<'2000-01-01'::date
    or payment_amount is null or not(payment_amount>0 and payment_amount<=10000000) or payment_amount<>round(payment_amount,2)
    or payment_method is null or payment_method not in ('UPI','Bank transfer','Cash','Other')
    or payment_reference is null or length(btrim(payment_reference))>200
    or (payment_method<>'Cash' and btrim(payment_reference)='')
    or payment_description is null or length(btrim(payment_description)) not between 1 and 1000 then
    raise exception 'Check payment date, positive amount (two decimals), method, reference and work description.'; end if;
  select status into state from public.artisan_applications where id=application_id for update;
  if not found then raise exception 'Artisan not found.'; end if;
  select * into previous from public.artisan_payments where id=request_id;
  if found then
    if previous.application_id=application_id and previous.paid_on=payment_date and previous.amount=payment_amount
      and previous.method=payment_method and previous.reference=btrim(payment_reference)
      and previous.description=btrim(payment_description) and previous.actor_id=auth.uid() then return request_id; end if;
    raise exception 'Payment request changed. Refresh before retrying.';
  end if;
  insert into public.artisan_payments(id,application_id,paid_on,amount,method,reference,description,actor_id)
    values(request_id,application_id,payment_date,payment_amount,payment_method,btrim(payment_reference),btrim(payment_description),auth.uid());
  insert into public.artisan_application_history(application_id,actor_id,action,new_status)
    values(application_id,auth.uid(),'Payment recorded',state);
  return request_id;
end $$;
revoke all on function public.record_artisan_payment(uuid,uuid,date,numeric,text,text,text) from public,anon;
grant execute on function public.record_artisan_payment(uuid,uuid,date,numeric,text,text,text) to authenticated;

create function public.void_artisan_payment(payment_id uuid,reason text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare target uuid; state text;
begin
  if not public.is_catalogue_admin() then raise exception 'Verified admin access required.'; end if;
  if reason is null or length(btrim(reason)) not between 1 and 500 then raise exception 'Enter a correction reason up to 500 characters.'; end if;
  select application_id into target from public.artisan_payments where id=payment_id;
  select status into state from public.artisan_applications where id=target for update;
  if not found then raise exception 'Payment not found.'; end if;
  update public.artisan_payments set voided_at=now(),void_reason=btrim(reason),voided_by=auth.uid() where id=payment_id and voided_at is null;
  if not found then raise exception 'Payment already voided. Refresh the ledger.'; end if;
  insert into public.artisan_application_history(application_id,actor_id,action,new_status)
    values(target,auth.uid(),'Payment voided',state);
  return payment_id;
end $$;
revoke all on function public.void_artisan_payment(uuid,text) from public,anon;
grant execute on function public.void_artisan_payment(uuid,text) to authenticated;

create function public.read_artisan_profile_photo(application_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare photo bytea;
begin
  if not public.is_catalogue_admin() then raise exception 'Verified admin access required.'; end if;
  select content into photo from public.artisan_profile_photos where artisan_profile_photos.application_id=$1;
  if not found then raise exception 'No profile photo retained.'; end if;
  return jsonb_build_object('contentType','image/webp','data',replace(encode(photo,'base64'),E'\n',''));
end $$;
create function public.remove_artisan_profile_photo(application_id uuid,expected_version integer)
returns uuid language plpgsql security definer set search_path=''
as $$
declare state text;
begin
  if not public.is_catalogue_admin() then raise exception 'Verified admin access required.'; end if;
  update public.artisan_applications set has_profile_photo=false,version=version+1,updated_at=now()
    where id=application_id and version=expected_version returning status into state;
  if not found then raise exception 'Application changed. Refresh before removing photo.'; end if;
  delete from public.artisan_profile_photos where artisan_profile_photos.application_id=$1;
  insert into public.artisan_application_history(application_id,actor_id,action,new_status)
    values(application_id,auth.uid(),'Profile photo removed',state);
  return application_id;
end $$;
revoke all on function public.read_artisan_profile_photo(uuid),public.remove_artisan_profile_photo(uuid,integer) from public,anon;
grant execute on function public.read_artisan_profile_photo(uuid),public.remove_artisan_profile_photo(uuid,integer) to authenticated;

create or replace function public.delete_artisan_application(application_id uuid,expected_version integer)
returns uuid language plpgsql security definer set search_path=''
as $$
declare removed_invitation uuid;
begin
  if not public.is_catalogue_admin() then raise exception 'Verified admin access required.'; end if;
  perform 1 from public.artisan_applications where id=application_id for update;
  if exists(select 1 from public.artisan_payments where artisan_payments.application_id=$1) then
    raise exception 'Payment history must be retained. Mark this artisan Inactive instead of deleting.';
  end if;
  delete from public.artisan_applications where id=application_id and version=expected_version returning invitation_id into removed_invitation;
  if not found then raise exception 'Application changed or no longer exists. Refresh before deleting.'; end if;
  delete from public.artisan_invitations where id=removed_invitation;
  return application_id;
end $$;
select cron.schedule('expire-artisan-applications','41 2 * * *',
  $job$
    delete from public.artisan_applications a where status not in ('Approved','Inactive') and updated_at<now()-interval '180 days'
      and not exists(select 1 from public.artisan_payments p where p.application_id=a.id);
    delete from public.artisan_invitations i where created_at<now()-interval '180 days'
      and not exists(select 1 from public.artisan_applications a where a.invitation_id=i.id);
  $job$);
