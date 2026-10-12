create table public.store_feedback (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  message text not null check(length(message) between 10 and 3000),
  category text not null check(category in ('general','suggestion','website','product')),
  contact_name text not null check(length(contact_name)<=80),
  contact_email text not null check(length(contact_email)<=254),
  wants_reply boolean not null,
  created_at timestamptz not null default now(),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  accepted_at timestamptz,
  provider_id text,
  last_error text,
  check((not wants_reply and contact_email='') or (wants_reply and contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'))
);
create index store_feedback_session_date on public.store_feedback(user_id,created_at);
alter table public.store_feedback enable row level security;
revoke all on public.store_feedback from public,anon,authenticated;
grant all on public.store_feedback to service_role;

create function public.submit_store_feedback(request_id uuid,feedback_message text,feedback_category text,
  contact_name text,contact_email text,wants_reply boolean)
returns uuid language plpgsql security definer set search_path=''
as $$
declare owner_id uuid:=auth.uid(); existing public.store_feedback;
begin
  if owner_id is null or auth.role() is distinct from 'authenticated' then raise exception 'Feedback session required.'; end if;
  if request_id is null or feedback_message is null or length(btrim(feedback_message)) not between 10 and 3000
    or feedback_category is null or feedback_category not in ('general','suggestion','website','product')
    or contact_name is null or length(btrim(contact_name))>80 or contact_email is null or length(btrim(contact_email))>254
    or wants_reply is null or (wants_reply and btrim(contact_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
    raise exception 'Enter valid feedback and a reply email only if a reply is requested.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(817264);
  select * into existing from public.store_feedback where id=request_id;
  if found then
    if existing.user_id=owner_id and existing.message=btrim(feedback_message) and existing.category=feedback_category
      and existing.contact_name=btrim(contact_name) and existing.wants_reply=wants_reply
      and existing.contact_email=(case when wants_reply then lower(btrim(contact_email)) else '' end) then return request_id; end if;
    raise exception 'Feedback request changed. Start a new submission.';
  end if;
  if exists(select 1 from public.cart_session_blocks where user_id=owner_id) then raise exception 'This session is blocked.'; end if;
  if (select count(*) from public.store_feedback where user_id=owner_id and created_at>now()-interval '1 hour')>=3
    or (select count(*) from public.store_feedback where created_at>now()-interval '1 day')>=100 then
    raise exception 'Feedback submission limit reached. Please try later or email feedback@luviacreations.com.';
  end if;
  insert into public.store_feedback(id,user_id,message,category,contact_name,contact_email,wants_reply)
  values(request_id,owner_id,btrim(feedback_message),feedback_category,btrim(contact_name),
    case when wants_reply then lower(btrim(contact_email)) else '' end,wants_reply);
  return request_id;
end $$;
revoke all on function public.submit_store_feedback(uuid,text,text,text,text,boolean) from public,anon;
grant execute on function public.submit_store_feedback(uuid,text,text,text,text,boolean) to authenticated;

create function public.claim_store_feedback()
returns setof public.store_feedback language plpgsql security definer set search_path=''
as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Backend access required.'; end if;
  return query with due as (
    select e.id from public.store_feedback e where e.accepted_at is null and e.next_attempt_at<=now() and e.attempts<8
    order by e.next_attempt_at for update skip locked limit 5
  )
  update public.store_feedback e set attempts=e.attempts+1,next_attempt_at=now()+interval '15 minutes'
  from due where e.id=due.id returning e.*;
end $$;
revoke all on function public.claim_store_feedback() from public,anon,authenticated;
grant execute on function public.claim_store_feedback() to service_role;

create function public.dispatch_store_feedback()
returns void language plpgsql security definer set search_path=''
as $$
declare worker_secret text;
begin
  if not exists(select 1 from public.store_feedback where accepted_at is null and next_attempt_at<=now() and attempts<8) then return; end if;
  select decrypted_secret into worker_secret from vault.decrypted_secrets where name='customer_welcome_worker_secret';
  if worker_secret is null then raise log 'Feedback worker secret missing; submissions remain queued.'; return; end if;
  perform net.http_post(url:='https://bblsjcjypdxntzlszliy.supabase.co/functions/v1/feedback-worker',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||worker_secret),
    body:='{}'::jsonb,timeout_milliseconds:=1000);
end $$;
revoke all on function public.dispatch_store_feedback() from public,anon,authenticated;
select cron.schedule('send-store-feedback','* * * * *',$job$select public.dispatch_store_feedback();$job$);
select cron.schedule('expire-store-feedback','31 2 * * *',$job$delete from public.store_feedback where created_at<now()-interval '90 days';$job$);
