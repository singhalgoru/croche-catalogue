create table public.product_patterns (
  product_id uuid primary key references public.products(id) on delete cascade,
  revision uuid not null unique,
  filename text not null check(length(filename) between 6 and 120 and filename ~ '^[A-Za-z0-9][A-Za-z0-9_. -]*\.docx$'),
  content bytea not null check(octet_length(content) between 100 and 2097152
    and substring(content from 1 for 4)=decode('504b0304','hex')),
  pdf_filename text not null check(length(pdf_filename) between 5 and 120 and pdf_filename ~ '^[A-Za-z0-9][A-Za-z0-9_. -]*\.pdf$'),
  pdf_content bytea not null check(octet_length(pdf_content) between 100 and 2097152
    and substring(pdf_content from 1 for 5)=convert_to('%PDF-','UTF8')),
  language text not null check(language in ('en','hi')),
  updated_at timestamptz not null default now()
);
create table public.product_pattern_emails (
  id uuid primary key,
  product_id uuid references public.products(id) on delete set null,
  application_id uuid not null references public.artisan_applications(id) on delete cascade,
  revision uuid not null,
  product_name text not null,
  recipient_name text not null,
  recipient_email text not null,
  filename text not null,
  language text not null,
  content bytea,
  message text not null check(length(message)<=1500),
  attempts integer not null default 0,
  first_attempt_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  accepted_at timestamptz,
  provider_id text,
  last_error text,
  created_at timestamptz not null default now(),
  actor_id uuid references auth.users(id) on delete set null
);
create index product_pattern_emails_due on public.product_pattern_emails(next_attempt_at)
  where accepted_at is null and attempts<8;
alter table public.product_patterns enable row level security;
alter table public.product_pattern_emails enable row level security;
revoke all on public.product_patterns, public.product_pattern_emails from public,anon,authenticated;
grant all on public.product_patterns, public.product_pattern_emails to service_role;

create function public.product_pattern_workspace(target_product uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
begin
  if not public.is_catalogue_admin() then raise exception 'Verified admin access required.'; end if;
  if not exists(select 1 from public.products where id=target_product) then raise exception 'Product not found.'; end if;
  return jsonb_build_object(
    'pattern',(select jsonb_build_object('revision',revision,'filename',filename,'updated_at',updated_at,
      'size',octet_length(content),'pdf_filename',pdf_filename,'pdf_size',octet_length(pdf_content),'language',language)
      from public.product_patterns where product_id=target_product),
    'recipients',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',details->>'fullName','email',contact_email)
      order by details->>'fullName',id) from public.artisan_applications
      where status='Approved' and contact_email is not null),'[]'::jsonb),
    'emails',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc) from (
      select id,recipient_email,filename,created_at,accepted_at,attempts,last_error
      from public.product_pattern_emails where product_id=target_product order by created_at desc limit 20
    ) e),'[]'::jsonb)
  );
end $$;

create function public.save_product_pattern(target_product uuid, expected_revision uuid, new_revision uuid,
  document_name text, document_data text, pdf_name text, pdf_data text, pattern_language text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare existing uuid; bytes bytea; pdf bytea; privileges text[]; permission_bits integer;
begin
  if not public.is_catalogue_admin() then raise exception 'Verified admin access required.'; end if;
  perform 1 from public.products where id=target_product for update;
  if not found then raise exception 'Product not found.'; end if;
  if new_revision is null or document_name is null or length(document_name)>120
    or document_name !~ '^[A-Za-z0-9][A-Za-z0-9_. -]*\.docx$'
    or document_data is null or length(document_data)>2796204 or document_data !~ '^[A-Za-z0-9+/]+={0,2}$' then
    raise exception 'Choose an editable .docx pattern up to 2 MB with a simple filename.';
  end if;
  bytes:=decode(document_data,'base64');
  if pdf_name is null or length(pdf_name)>120 or pdf_name !~ '^[A-Za-z0-9][A-Za-z0-9_. -]*\.pdf$'
    or pdf_data is null or length(pdf_data)>2796204 or pdf_data !~ '^[A-Za-z0-9+/]+={0,2}$'
    or pattern_language is null or pattern_language not in ('en','hi') then
    raise exception 'Prepare a print-restricted PDF and select English or Hindi before saving.';
  end if;
  pdf:=decode(pdf_data,'base64');
  privileges:=regexp_match(encode(pdf,'escape'),'/P[[:space:]]+(-?[0-9]+)');
  permission_bits:=privileges[1]::integer;
  if position(convert_to('/Encrypt','UTF8') in pdf)=0 or permission_bits is null
    or (permission_bits & 2052)<>2052 or (permission_bits & 1848)<>0 then
    raise exception 'PDF must allow printing and disallow copying, editing, annotations, forms and assembly.';
  end if;
  select revision into existing from public.product_patterns where product_id=target_product;
  if existing=new_revision then
    if exists(select 1 from public.product_patterns where product_id=target_product and filename=document_name and content=bytes
      and pdf_filename=pdf_name and pdf_content=pdf and language=pattern_language) then
      return new_revision;
    end if;
    raise exception 'Upload request changed. Refresh before uploading again.';
  end if;
  if existing is distinct from expected_revision then raise exception 'Pattern changed. Refresh before uploading.'; end if;
  insert into public.product_patterns(product_id,revision,filename,content,pdf_filename,pdf_content,language)
    values(target_product,new_revision,document_name,bytes,pdf_name,pdf,pattern_language)
    on conflict(product_id) do update set revision=excluded.revision,filename=excluded.filename,content=excluded.content,
      pdf_filename=excluded.pdf_filename,pdf_content=excluded.pdf_content,language=excluded.language,updated_at=now();
  return new_revision;
end $$;

create function public.read_product_pattern_pdf(target_product uuid, expected_revision uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare result jsonb;
begin
  if not public.is_catalogue_admin() then raise exception 'Verified admin access required.'; end if;
  select jsonb_build_object('filename',pdf_filename,'data',replace(encode(pdf_content,'base64'),E'\n',''))
    into result from public.product_patterns where product_id=target_product and revision=expected_revision;
  if result is null then raise exception 'Pattern changed or was removed. Refresh before downloading.'; end if;
  return result;
end $$;

create function public.read_product_pattern(target_product uuid, expected_revision uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare result jsonb;
begin
  if not public.is_catalogue_admin() then raise exception 'Verified admin access required.'; end if;
  select jsonb_build_object('filename',filename,'data',replace(encode(content,'base64'),E'\n',''))
    into result from public.product_patterns where product_id=target_product and revision=expected_revision;
  if result is null then raise exception 'Pattern changed or was removed. Refresh before downloading.'; end if;
  return result;
end $$;

create function public.remove_product_pattern(target_product uuid, expected_revision uuid)
returns uuid language plpgsql security definer set search_path=''
as $$
begin
  if not public.is_catalogue_admin() then raise exception 'Verified admin access required.'; end if;
  perform 1 from public.products where id=target_product for update;
  delete from public.product_patterns where product_id=target_product and revision=expected_revision;
  if not found then raise exception 'Pattern changed or was removed. Refresh before removing.'; end if;
  return expected_revision;
end $$;

create function public.queue_product_pattern_email(target_product uuid, expected_revision uuid, artisan_id uuid, request_id uuid, artisan_message text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare pattern public.product_patterns; artisan public.artisan_applications; product_name text; existing public.product_pattern_emails;
begin
  if not public.is_catalogue_admin() then raise exception 'Verified admin access required.'; end if;
  if request_id is null or artisan_message is null or length(artisan_message)>1500 then raise exception 'Check the sharing request and message (up to 1,500 characters).'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(request_id::text,0));
  select * into existing from public.product_pattern_emails where id=request_id;
  if found then
    if existing.product_id is distinct from target_product or existing.revision is distinct from expected_revision
      or existing.application_id is distinct from artisan_id or existing.message<>btrim(artisan_message) then
      raise exception 'Email request changed. Refresh before sharing again.';
    end if;
    return request_id;
  end if;
  if (select count(*) from public.product_pattern_emails where actor_id=auth.uid() and created_at>now()-interval '1 day')>=100 then
    raise exception 'Daily pattern email limit reached.';
  end if;
  select name into product_name from public.products where id=target_product for share;
  if not found then raise exception 'Product not found.'; end if;
  select * into pattern from public.product_patterns where product_id=target_product and revision=expected_revision;
  if not found then raise exception 'Pattern changed or was removed. Refresh before sharing.'; end if;
  select * into artisan from public.artisan_applications where id=artisan_id for share;
  if not found or artisan.status<>'Approved' or artisan.contact_email is null then
    raise exception 'Choose an Approved artisan with an application email address.';
  end if;
  insert into public.product_pattern_emails(id,product_id,application_id,revision,product_name,
    recipient_name,recipient_email,filename,content,language,message,actor_id)
  values(request_id,target_product,artisan_id,expected_revision,product_name,
    artisan.details->>'fullName',artisan.contact_email,pattern.pdf_filename,pattern.pdf_content,pattern.language,btrim(artisan_message),auth.uid());
  return request_id;
end $$;

create function public.claim_product_pattern_emails()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare result jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Backend access required.'; end if;
  update public.product_pattern_emails set attempts=8,last_error='Retry window expired. Check provider delivery before any new send.'
    where accepted_at is null and attempts<8 and first_attempt_at<now()-interval '23 hours';
  update public.product_pattern_emails e set attempts=8,last_error='Cancelled: artisan is no longer Approved or email changed.',content=null
    where accepted_at is null and attempts<8 and not exists(
      select 1 from public.artisan_applications a where a.id=e.application_id and a.status='Approved' and a.contact_email=e.recipient_email);
  with due as (
    select id from public.product_pattern_emails where accepted_at is null and attempts<8
      and next_attempt_at<=now() order by next_attempt_at for update skip locked limit 3
  ), claimed as (
    update public.product_pattern_emails e set attempts=e.attempts+1,first_attempt_at=coalesce(e.first_attempt_at,now()),
      next_attempt_at=now()+interval '15 minutes'
    from due where e.id=due.id returning e.*
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'recipient_name',recipient_name,'recipient_email',recipient_email,
    'product_name',product_name,'filename',filename,'message',message,'language',language,
    'data',replace(encode(content,'base64'),E'\n',''))),'[]'::jsonb) into result from claimed;
  return result;
end $$;

revoke all on function public.product_pattern_workspace(uuid), public.save_product_pattern(uuid,uuid,uuid,text,text,text,text,text),
  public.read_product_pattern(uuid,uuid),public.read_product_pattern_pdf(uuid,uuid),public.remove_product_pattern(uuid,uuid),
  public.queue_product_pattern_email(uuid,uuid,uuid,uuid,text),public.claim_product_pattern_emails() from public,anon,authenticated;
grant execute on function public.product_pattern_workspace(uuid),public.save_product_pattern(uuid,uuid,uuid,text,text,text,text,text),
  public.read_product_pattern(uuid,uuid),public.read_product_pattern_pdf(uuid,uuid),public.remove_product_pattern(uuid,uuid),
  public.queue_product_pattern_email(uuid,uuid,uuid,uuid,text) to authenticated;
grant execute on function public.claim_product_pattern_emails() to service_role;

create or replace function public.dispatch_artisan_application_emails()
returns void language plpgsql security definer set search_path=''
as $$
declare worker_secret text;
begin
  if not exists(select 1 from public.artisan_application_emails where accepted_at is null and next_attempt_at<=now() and attempts<8)
    and not exists(select 1 from public.product_pattern_emails where accepted_at is null and next_attempt_at<=now() and attempts<8) then return; end if;
  select decrypted_secret into worker_secret from vault.decrypted_secrets where name='customer_welcome_worker_secret';
  if worker_secret is null then raise log 'Artisan email worker secret is missing; notifications remain queued.'; return; end if;
  perform net.http_post(
    url:='https://bblsjcjypdxntzlszliy.supabase.co/functions/v1/artisan-application-email-worker',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||worker_secret),
    body:='{}'::jsonb,timeout_milliseconds:=1000);
end $$;
select cron.schedule('expire-product-pattern-emails','43 2 * * *',
  $job$delete from public.product_pattern_emails where created_at<now()-interval '30 days' and (accepted_at is not null or attempts>=8);$job$);
