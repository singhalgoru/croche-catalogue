create table public.artisan_work_assignments (
  id uuid primary key,
  application_id uuid not null references public.artisan_applications(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  request_data jsonb not null,
  offer jsonb not null,
  recipient_email text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  check (completed_at is null or accepted_at is not null)
);

create table public.artisan_work_attachments (
  assignment_id uuid not null references public.artisan_work_assignments(id) on delete cascade,
  position integer not null,
  filename text not null,
  content bytea not null,
  primary key (assignment_id, position)
);

create table public.artisan_work_emails (
  assignment_id uuid not null references public.artisan_work_assignments(id) on delete cascade,
  kind text not null check (kind in ('offer','acceptance')),
  token text,
  attempts integer not null default 0,
  first_attempt_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  accepted_at timestamptz,
  provider_id text,
  last_error text,
  primary key (assignment_id, kind)
);
create index artisan_work_emails_due on public.artisan_work_emails(next_attempt_at)
  where accepted_at is null and attempts < 8;
alter table public.artisan_work_assignments enable row level security;
alter table public.artisan_work_attachments enable row level security;
alter table public.artisan_work_emails enable row level security;
revoke all on public.artisan_work_assignments, public.artisan_work_attachments, public.artisan_work_emails from public, anon, authenticated;
grant all on public.artisan_work_assignments, public.artisan_work_attachments, public.artisan_work_emails to service_role;

create function public.create_artisan_work_assignment(request_id uuid, artisan_id uuid, draft jsonb)
returns uuid language plpgsql security definer set search_path=''
as $$
declare
  app public.artisan_applications; existing public.artisan_work_assignments;
  item jsonb; product public.products; pattern public.product_patterns;
  items jsonb := '[]'::jsonb; position integer := 0; attachment_bytes bigint := 0;
  token text; delivery date; quantity integer; with_yarn numeric; without_yarn numeric;
begin
  if not public.is_catalogue_admin() then raise exception 'Verified admin access required.'; end if;
  if request_id is null or artisan_id is null or jsonb_typeof(draft) is distinct from 'object' then
    raise exception 'Invalid assignment request.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(request_id::text,0));
  select * into existing from public.artisan_work_assignments where id=request_id;
  if found then
    if existing.application_id is distinct from artisan_id or existing.actor_id is distinct from auth.uid()
      or existing.request_data is distinct from draft then raise exception 'Assignment request changed. Check the existing assignment before creating another.'; end if;
    return request_id;
  end if;
  if jsonb_typeof(draft->'recipientName') is distinct from 'string' or length(btrim(draft->>'recipientName')) not between 1 and 100
    or jsonb_typeof(draft->'recipientEmail') is distinct from 'string' or length(draft->>'recipientEmail') not between 3 and 254
    or jsonb_typeof(draft->'subject') is distinct from 'string' or length(btrim(draft->>'subject')) not between 1 and 150
    or (draft->>'subject') ~ E'[\\r\\n]'
    or jsonb_typeof(draft->'message') is distinct from 'string' or length(btrim(draft->>'message')) not between 1 and 3000
    or jsonb_typeof(draft->'deliveryDate') is distinct from 'string' or (draft->>'deliveryDate') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or jsonb_typeof(draft->'courierCap') is distinct from 'number' or (draft->>'courierCap') !~ '^[0-9]{1,7}(\.[0-9]{1,2})?$'
    or jsonb_typeof(draft->'items') is distinct from 'array' or jsonb_array_length(draft->'items') not between 1 and 10 then
    raise exception 'Check the assignment subject, message, delivery date, courier cap and products.';
  end if;
  delivery := (draft->>'deliveryDate')::date;
  if delivery < (now() at time zone 'Asia/Kolkata')::date then raise exception 'Delivery date cannot be in the past.'; end if;
  select * into app from public.artisan_applications where id=artisan_id for share;
  if not found or app.status <> 'Approved' or app.contact_email is null then
    raise exception 'Choose an approved artisan with an application email address.';
  end if;
  if app.contact_email is distinct from draft->>'recipientEmail' or app.details->>'fullName' is distinct from draft->>'recipientName' then
    raise exception 'Artisan name or email changed. Reopen the assignment and review the recipient.';
  end if;
  for item in select value from jsonb_array_elements(draft->'items') loop
    position := position + 1;
    if jsonb_typeof(item) is distinct from 'object'
      or jsonb_typeof(item->'name') is distinct from 'string' or length(btrim(item->>'name')) not between 1 and 100
      or jsonb_typeof(item->'quantity') is distinct from 'number' or (item->>'quantity') !~ '^[0-9]{1,5}$'
      or jsonb_typeof(item->'rateWithYarn') is distinct from 'number' or (item->>'rateWithYarn') !~ '^[0-9]{1,7}(\.[0-9]{1,2})?$'
      or jsonb_typeof(item->'rateWithoutYarn') is distinct from 'number' or (item->>'rateWithoutYarn') !~ '^[0-9]{1,7}(\.[0-9]{1,2})?$'
      or coalesce(jsonb_typeof(item->'productId'),'missing') not in ('string','null')
      or coalesce(jsonb_typeof(item->'patternRevision'),'missing') not in ('string','null') then
      raise exception 'Check product names, quantities and per-unit prices.';
    end if;
    quantity := (item->>'quantity')::integer;
    if quantity < 1 then raise exception 'Quantity must be at least one.'; end if;
    with_yarn := (item->>'rateWithYarn')::numeric;
    without_yarn := (item->>'rateWithoutYarn')::numeric;
    pattern := null;
    if item->>'productId' is not null then
      select * into product from public.products where id=(item->>'productId')::uuid for share;
      if not found or product.name is distinct from item->>'name' then raise exception 'A catalogue product changed. Refresh and review the assignment.'; end if;
      if item->>'patternRevision' is not null then
        select * into pattern from public.product_patterns where product_id=product.id and revision=(item->>'patternRevision')::uuid for share;
        if not found then raise exception 'A selected pattern changed or was removed. Refresh and review the assignment.'; end if;
        attachment_bytes := attachment_bytes + octet_length(pattern.pdf_content);
        if attachment_bytes > 8388608 then raise exception 'Selected patterns exceed the 8 MB total attachment limit.'; end if;
      end if;
    elsif item->>'patternRevision' is not null then raise exception 'A manual product cannot have a catalogue pattern.';
    end if;
    items := items || jsonb_build_array(jsonb_build_object('name',btrim(item->>'name'),'quantity',quantity,
      'rateWithYarn',with_yarn,'rateWithoutYarn',without_yarn,'patternFilename',pattern.pdf_filename));
  end loop;
  token := encode(extensions.gen_random_bytes(32),'hex');
  insert into public.artisan_work_assignments(id,application_id,actor_id,request_data,offer,recipient_email,token_hash,expires_at)
    values(request_id,artisan_id,auth.uid(),draft,jsonb_build_object(
      'recipientName',app.details->>'fullName','reference',request_id::text,'subject',btrim(draft->>'subject'),'message',btrim(draft->>'message'),
      'deliveryDate',delivery::text,'courierCap',(draft->>'courierCap')::numeric,'items',items),
      app.contact_email,encode(extensions.digest(token,'sha256'),'hex'),now()+interval '30 days');
  insert into public.artisan_work_attachments(assignment_id,position,filename,content)
    select request_id, ordinal::integer, p.pdf_filename, p.pdf_content
    from jsonb_array_elements(draft->'items') with ordinality as i(value,ordinal)
    join public.product_patterns p on p.product_id=(i.value->>'productId')::uuid and p.revision=(i.value->>'patternRevision')::uuid
    where i.value->>'patternRevision' is not null;
  insert into public.artisan_work_emails(assignment_id,kind,token) values(request_id,'offer',token);
  return request_id;
end $$;

create function public.read_artisan_work_assignment(token text)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare assignment public.artisan_work_assignments;
begin
  if token is null or token !~ '^[a-f0-9]{64}$' then raise exception 'Invalid or expired assignment link.'; end if;
  select * into assignment from public.artisan_work_assignments
    where token_hash=encode(extensions.digest(token,'sha256'),'hex');
  if not found or assignment.expires_at <= now() then
    raise exception 'Invalid or expired assignment link. Contact Luvia.';
  end if;
  return jsonb_build_object('offer',assignment.offer,'acceptedAt',assignment.accepted_at,'completedAt',assignment.completed_at,'expiresAt',assignment.expires_at);
end $$;

create function public.accept_artisan_work_assignment(token text)
returns boolean language plpgsql security definer set search_path=''
as $$
declare assignment public.artisan_work_assignments;
begin
  if token is null or token !~ '^[a-f0-9]{64}$' then raise exception 'Invalid or expired assignment link.'; end if;
  select * into assignment from public.artisan_work_assignments
    where token_hash=encode(extensions.digest(token,'sha256'),'hex') for update;
  if not found or assignment.expires_at <= now() then
    raise exception 'Invalid or expired assignment link. Contact Luvia.';
  end if;
  if assignment.accepted_at is null then
    if not exists(select 1 from public.artisan_applications where id=assignment.application_id
      and status='Approved' and contact_email=assignment.recipient_email) then
      raise exception 'This assignment is no longer available. Contact Luvia.';
    end if;
    update public.artisan_work_assignments set accepted_at=now() where id=assignment.id;
    insert into public.artisan_work_emails(assignment_id,kind) values(assignment.id,'acceptance');
  end if;
  return true;
end $$;

create function public.list_artisan_work_assignments(artisan_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
begin
  if not public.is_catalogue_admin() then raise exception 'Verified admin access required.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'offer',a.offer,'createdAt',a.created_at,
    'acceptedAt',a.accepted_at,'completedAt',a.completed_at,'expiresAt',a.expires_at,
    'offerSentAt',e.accepted_at,'offerError',e.last_error,'offerAttempts',e.attempts,
    'confirmationSentAt',c.accepted_at,'confirmationError',c.last_error,'confirmationAttempts',c.attempts)
    order by a.created_at desc) from public.artisan_work_assignments a
    join public.artisan_work_emails e on e.assignment_id=a.id and e.kind='offer'
    left join public.artisan_work_emails c on c.assignment_id=a.id and c.kind='acceptance'
    where a.application_id=artisan_id),'[]'::jsonb);
end $$;

create function public.complete_artisan_work_assignment(assignment_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $$
begin
  if not public.is_catalogue_admin() then raise exception 'Verified admin access required.'; end if;
  update public.artisan_work_assignments set completed_at=coalesce(completed_at,now())
    where id=assignment_id and accepted_at is not null;
  if not found then raise exception 'Only accepted work can be completed.'; end if;
  return true;
end $$;

create function public.claim_artisan_work_emails()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare result jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Backend access required.'; end if;
  update public.artisan_work_emails set attempts=8,last_error='Retry window expired. Check provider delivery before sending another assignment.'
    where accepted_at is null and attempts<8 and first_attempt_at<now()-interval '23 hours';
  update public.artisan_work_emails e set attempts=8,last_error='Cancelled: artisan approval or email changed.',token=null
    from public.artisan_work_assignments a
    where e.assignment_id=a.id and e.kind='offer' and e.accepted_at is null and e.attempts<8
      and not exists(select 1 from public.artisan_applications app where app.id=a.application_id and app.status='Approved' and app.contact_email=a.recipient_email);
  update public.artisan_work_emails e set attempts=8,last_error='Cancelled: assignment link expired before sending.',token=null
    from public.artisan_work_assignments a where e.assignment_id=a.id and e.kind='offer' and e.accepted_at is null
      and e.attempts<8 and a.expires_at<=now();
  with due as (
    select assignment_id,kind from public.artisan_work_emails where accepted_at is null and attempts<8
      and next_attempt_at<=now() order by next_attempt_at for update skip locked limit 3
  ), claimed as (
    update public.artisan_work_emails e set attempts=e.attempts+1,first_attempt_at=coalesce(e.first_attempt_at,now()),
      next_attempt_at=now()+interval '15 minutes' from due
      where e.assignment_id=due.assignment_id and e.kind=due.kind returning e.*
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'kind',c.kind,'token',c.token,'offer',a.offer,
    'recipientEmail',a.recipient_email,'acceptedAt',a.accepted_at,
    'attachments',case when c.kind='offer' then coalesce((select jsonb_agg(jsonb_build_object('filename',p.filename,
      'content',replace(encode(p.content,'base64'),E'\n','')) order by p.position)
      from public.artisan_work_attachments p where p.assignment_id=a.id),'[]'::jsonb) else '[]'::jsonb end)),'[]'::jsonb)
    into result from claimed c join public.artisan_work_assignments a on a.id=c.assignment_id;
  return result;
end $$;

revoke all on function public.create_artisan_work_assignment(uuid,uuid,jsonb), public.read_artisan_work_assignment(text),
  public.accept_artisan_work_assignment(text), public.list_artisan_work_assignments(uuid),
  public.complete_artisan_work_assignment(uuid), public.claim_artisan_work_emails() from public,anon,authenticated;
grant execute on function public.create_artisan_work_assignment(uuid,uuid,jsonb), public.list_artisan_work_assignments(uuid),
  public.complete_artisan_work_assignment(uuid) to authenticated;
grant execute on function public.read_artisan_work_assignment(text), public.accept_artisan_work_assignment(text) to anon,authenticated;
grant execute on function public.claim_artisan_work_emails() to service_role;

create or replace function public.delete_artisan_application(application_id uuid,expected_version integer)
returns uuid language plpgsql security definer set search_path=''
as $$
declare removed_invitation uuid;
begin
  if not public.is_catalogue_admin() then raise exception 'Verified admin access required.'; end if;
  if exists(select 1 from public.artisan_payments where artisan_payments.application_id=$1)
    or exists(select 1 from public.artisan_work_assignments where artisan_work_assignments.application_id=$1) then
    raise exception 'Payment or work assignment history must be retained. Mark this artisan Inactive instead of deleting.';
  end if;
  delete from public.artisan_applications where id=application_id and version=expected_version returning invitation_id into removed_invitation;
  if not found then raise exception 'Application changed or no longer exists. Refresh before deleting.'; end if;
  delete from public.artisan_invitations where id=removed_invitation;
  return application_id;
end $$;

select cron.schedule('expire-artisan-applications','41 2 * * *',
  $job$
    delete from public.artisan_applications a where status not in ('Approved','Inactive') and updated_at<now()-interval '180 days'
      and not exists(select 1 from public.artisan_payments p where p.application_id=a.id)
      and not exists(select 1 from public.artisan_work_assignments w where w.application_id=a.id);
    delete from public.artisan_invitations i where created_at<now()-interval '180 days'
      and not exists(select 1 from public.artisan_applications a where a.invitation_id=i.id);
  $job$);
select cron.schedule('purge-artisan-work-email-content','47 2 * * *',
  $job$
    update public.artisan_work_emails set token=null where kind='offer' and (accepted_at is not null or attempts>=8);
    delete from public.artisan_work_attachments p using public.artisan_work_emails e
      where e.assignment_id=p.assignment_id and e.kind='offer' and (e.accepted_at is not null or e.attempts>=8);
  $job$);

create or replace function public.dispatch_artisan_application_emails()
returns void language plpgsql security definer set search_path=''
as $$
declare worker_secret text;
begin
  if not exists(select 1 from public.artisan_application_emails where accepted_at is null and next_attempt_at<=now() and attempts<8)
    and not exists(select 1 from public.product_pattern_emails where accepted_at is null and next_attempt_at<=now() and attempts<8)
    and not exists(select 1 from public.artisan_work_emails where accepted_at is null and next_attempt_at<=now() and attempts<8) then return; end if;
  select decrypted_secret into worker_secret from vault.decrypted_secrets where name='customer_welcome_worker_secret';
  if worker_secret is null then raise log 'Artisan email worker secret is missing; notifications remain queued.'; return; end if;
  perform net.http_post(
    url:='https://bblsjcjypdxntzlszliy.supabase.co/functions/v1/artisan-application-email-worker',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||worker_secret),
    body:='{}'::jsonb,timeout_milliseconds:=1000);
end $$;
