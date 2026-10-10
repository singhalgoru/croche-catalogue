create table public.order_confirmation_emails (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.payment_orders(id) on delete restrict,
  audience text not null check(audience in ('customer','store')),
  recipient text not null,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  accepted_at timestamptz,
  provider_id text,
  last_error text,
  unique(order_id,audience)
);
alter table public.order_confirmation_emails enable row level security;
revoke all on public.order_confirmation_emails from public,anon,authenticated;
grant all on public.order_confirmation_emails to service_role;
create policy "Admins read order email status" on public.order_confirmation_emails
for select to authenticated using(public.is_catalogue_admin());
grant select on public.order_confirmation_emails to authenticated;

create function public.require_live_order_email()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.is_live_checkout and (nullif(btrim(new.customer_email),'') is null
    or new.customer_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
    raise exception 'Save a valid contact email in delivery details to receive your order confirmation.';
  end if;
  return new;
end;
$$;
revoke all on function public.require_live_order_email() from public,anon,authenticated;
create trigger require_live_order_email before insert on public.payment_orders
for each row execute function public.require_live_order_email();

create function public.enqueue_order_confirmation_emails()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.is_live_checkout and new.status='paid' and old.status is distinct from 'paid' then
    insert into public.order_confirmation_emails(order_id,audience,recipient)
    values(new.id,'store','orders@luviacreations.com') on conflict do nothing;
    if nullif(btrim(new.customer_email),'') is not null then
      insert into public.order_confirmation_emails(order_id,audience,recipient)
      values(new.id,'customer',new.customer_email) on conflict do nothing;
    else
      raise log 'Paid live order % has no customer email; only the store notification was queued.',new.reference;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.enqueue_order_confirmation_emails() from public,anon,authenticated;
create trigger enqueue_order_confirmation_emails after update of status on public.payment_orders
for each row execute function public.enqueue_order_confirmation_emails();

create function public.claim_order_confirmation_emails()
returns setof public.order_confirmation_emails language plpgsql security definer set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Backend access required.'; end if;
  return query with due as (
    select e.id from public.order_confirmation_emails e
    where e.accepted_at is null and e.next_attempt_at<=now() and e.attempts<8
    order by e.next_attempt_at for update skip locked limit 5
  )
  update public.order_confirmation_emails e set attempts=e.attempts+1,next_attempt_at=now()+interval '15 minutes'
  from due where e.id=due.id returning e.*;
end;
$$;
revoke all on function public.claim_order_confirmation_emails() from public,anon,authenticated;
grant execute on function public.claim_order_confirmation_emails() to service_role;

create function public.dispatch_order_confirmation_emails()
returns void language plpgsql security definer set search_path = ''
as $$
declare worker_secret text;
begin
  if not exists(select 1 from public.order_confirmation_emails where accepted_at is null and next_attempt_at<=now() and attempts<8) then return; end if;
  select decrypted_secret into worker_secret from vault.decrypted_secrets where name='customer_welcome_worker_secret';
  if worker_secret is null then
    raise log 'Order email worker secret is not configured; messages remain queued.';
    return;
  end if;
  perform net.http_post(
    url:='https://bblsjcjypdxntzlszliy.supabase.co/functions/v1/order-confirmation-worker',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||worker_secret),
    body:='{}'::jsonb,timeout_milliseconds:=1000);
end;
$$;
revoke all on function public.dispatch_order_confirmation_emails() from public,anon,authenticated;
select cron.schedule('send-order-confirmation-emails','* * * * *',
  $job$select public.dispatch_order_confirmation_emails();$job$);
