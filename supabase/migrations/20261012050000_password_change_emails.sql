create table public.password_change_emails (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recipient text not null,
  changed_at timestamptz not null default now(),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  accepted_at timestamptz,
  provider_id text,
  last_error text
);
alter table public.password_change_emails enable row level security;
revoke all on public.password_change_emails from public,anon,authenticated;
grant all on public.password_change_emails to service_role;

create function public.enqueue_password_change_email()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if new.encrypted_password is distinct from old.encrypted_password
    and nullif(new.encrypted_password,'') is not null
    and new.email_confirmed_at is not null and not coalesce(new.is_anonymous,false)
    and nullif(btrim(new.email),'') is not null then
    insert into public.password_change_emails(user_id,recipient) values(new.id,new.email);
  end if;
  return new;
end $$;
revoke all on function public.enqueue_password_change_email() from public,anon,authenticated;
create trigger enqueue_password_change_email after update of encrypted_password on auth.users
for each row execute function public.enqueue_password_change_email();

create function public.claim_password_change_emails()
returns setof public.password_change_emails language plpgsql security definer set search_path=''
as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Backend access required.'; end if;
  return query with due as (
    select e.id from public.password_change_emails e
    where e.accepted_at is null and e.next_attempt_at<=now() and e.attempts<8
    order by e.next_attempt_at,e.id for update skip locked limit 5
  )
  update public.password_change_emails e set attempts=e.attempts+1,next_attempt_at=now()+interval '15 minutes'
  from due where e.id=due.id returning e.*;
end $$;
revoke all on function public.claim_password_change_emails() from public,anon,authenticated;
grant execute on function public.claim_password_change_emails() to service_role;

create function public.dispatch_password_change_emails()
returns void language plpgsql security definer set search_path=''
as $$
declare worker_secret text;
begin
  if not exists(select 1 from public.password_change_emails where accepted_at is null and next_attempt_at<=now() and attempts<8) then return; end if;
  select decrypted_secret into worker_secret from vault.decrypted_secrets where name='customer_welcome_worker_secret';
  if worker_secret is null then
    raise log 'Password change email worker secret is not configured; messages remain queued.';
    return;
  end if;
  perform net.http_post(
    url:='https://bblsjcjypdxntzlszliy.supabase.co/functions/v1/password-change-worker',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||worker_secret),
    body:='{}'::jsonb,timeout_milliseconds:=1000);
end $$;
revoke all on function public.dispatch_password_change_emails() from public,anon,authenticated;
select cron.schedule('send-password-change-emails','* * * * *',
  $job$select public.dispatch_password_change_emails();$job$);
