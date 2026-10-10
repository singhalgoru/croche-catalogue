create table public.pending_customer_signups (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  details jsonb not null,
  expires_at timestamptz not null default now() + interval '24 hours'
);
create table public.customer_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  details jsonb not null,
  activated_at timestamptz not null default now()
);
create table public.customer_welcome_emails (
  user_id uuid primary key references public.customer_profiles(user_id) on delete cascade,
  sent_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  attempts integer not null default 0,
  last_error text
);
alter table public.pending_customer_signups enable row level security;
alter table public.customer_profiles enable row level security;
alter table public.customer_welcome_emails enable row level security;
revoke all on public.pending_customer_signups, public.customer_profiles from anon, authenticated;
grant all on public.pending_customer_signups, public.customer_profiles to service_role;
revoke all on public.customer_welcome_emails from anon,authenticated;
grant all on public.customer_welcome_emails to service_role;
grant select on public.customer_profiles to authenticated;
create policy "Customers and admins can read activated profiles"
on public.customer_profiles for select to authenticated
using (user_id = auth.uid() or public.is_catalogue_admin());

create function public.stage_customer_signup(signup_details jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
declare owner_id uuid := auth.uid(); cleaned jsonb;
begin
  if owner_id is null or not exists(select 1 from auth.users where id=owner_id and is_anonymous) then
    raise exception 'An anonymous signup session is required.';
  end if;
  perform public.check_cart_write_limit(owner_id, 'write');
  if signup_details is null or jsonb_typeof(signup_details)<>'object'
    or octet_length(signup_details::text)>8192 then raise exception 'Invalid signup details.'; end if;
  cleaned := jsonb_build_object(
    'name',btrim(signup_details->>'name'),'phone',btrim(signup_details->>'phone'),
    'email',lower(btrim(signup_details->>'email')),
    'addressLine1',btrim(signup_details->>'addressLine1'),
    'addressLine2',btrim(coalesce(signup_details->>'addressLine2','')),
    'city',btrim(signup_details->>'city'),'state',btrim(signup_details->>'state'),
    'pincode',btrim(signup_details->>'pincode'));
  if coalesce(char_length(cleaned->>'name'),0) not between 1 and 80
    or coalesce(cleaned->>'phone','') !~ '^[6-9][0-9]{9}$'
    or coalesce(cleaned->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or char_length(cleaned->>'email')>254
    or coalesce(char_length(cleaned->>'addressLine1'),0) not between 5 and 200
    or char_length(cleaned->>'addressLine2')>200
    or coalesce(char_length(cleaned->>'city'),0) not between 1 and 80
    or coalesce(char_length(cleaned->>'state'),0) not between 1 and 80
    or coalesce(cleaned->>'pincode','') !~ '^[1-9][0-9]{5}$' then
    raise exception 'Enter a valid name, email, Indian mobile number and complete address.';
  end if;
  insert into public.pending_customer_signups(user_id,email,details,expires_at)
  values(owner_id,cleaned->>'email',cleaned,now()+interval '24 hours')
  on conflict(user_id) do update set email=excluded.email,details=excluded.details,expires_at=excluded.expires_at;
end $$;
revoke all on function public.stage_customer_signup(jsonb) from public,anon;
grant execute on function public.stage_customer_signup(jsonb) to authenticated;

-- Auth verification promotes the matching pending details even when the email
-- link is opened on another device and no frontend callback runs.
create function public.activate_customer_profile()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.email_confirmed_at is not null and not coalesce(new.is_anonymous,false) then
    insert into public.customer_profiles(user_id,email,details)
    select user_id,email,details from public.pending_customer_signups
    where user_id=new.id and email=lower(new.email) and expires_at>now()
    on conflict(user_id) do nothing;
    insert into public.customer_welcome_emails(user_id)
    select user_id from public.customer_profiles where user_id=new.id
    on conflict(user_id) do nothing;
    delete from public.pending_customer_signups where user_id=new.id and email=lower(new.email);
  end if;
  return new;
end $$;
create trigger activate_customer_profile after update of email,email_confirmed_at,is_anonymous on auth.users
for each row execute function public.activate_customer_profile();
revoke all on function public.activate_customer_profile() from public,anon,authenticated;

select cron.schedule('expire-pending-customer-signups','23 * * * *',
  $job$delete from public.pending_customer_signups where expires_at<=now();$job$);

create function public.claim_customer_welcome_emails()
returns table(user_id uuid) language plpgsql security definer set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Backend access required.'; end if;
  return query
  with due as (
    select w.user_id from public.customer_welcome_emails w
    where w.sent_at is null and w.next_attempt_at<=now()
    order by w.next_attempt_at for update skip locked limit 5
  )
  update public.customer_welcome_emails w
  set next_attempt_at=now()+interval '15 minutes',attempts=w.attempts+1
  from due where w.user_id=due.user_id returning w.user_id;
end $$;
revoke all on function public.claim_customer_welcome_emails() from public,anon,authenticated;
grant execute on function public.claim_customer_welcome_emails() to service_role;

create function public.dispatch_customer_welcome_emails()
returns void language plpgsql security definer set search_path = ''
as $$
declare worker_secret text;
begin
  if not exists(select 1 from public.customer_welcome_emails where sent_at is null and next_attempt_at<=now()) then return; end if;
  select decrypted_secret into worker_secret from vault.decrypted_secrets where name='customer_welcome_worker_secret';
  if worker_secret is null then
    raise log 'Customer welcome email worker secret is not configured; emails remain queued.';
    return;
  end if;
  perform net.http_post(
    url:='https://bblsjcjypdxntzlszliy.supabase.co/functions/v1/customer-welcome-worker',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||worker_secret),
    body:='{}'::jsonb,timeout_milliseconds:=1000);
end $$;
revoke all on function public.dispatch_customer_welcome_emails() from public,anon,authenticated;
select cron.schedule('send-customer-welcome-emails','*/2 * * * *',
  $job$select public.dispatch_customer_welcome_emails();$job$);
