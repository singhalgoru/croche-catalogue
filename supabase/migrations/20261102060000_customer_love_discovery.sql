-- Tracks when public Customer Love content last changed so sitemap.xml and llms.txt
-- can advertise an accurate lastmod, including withdrawals and deletions.
create table public.customer_love_discovery (
  singleton boolean primary key default true check (singleton),
  changed_at timestamptz not null default now()
);
alter table public.customer_love_discovery enable row level security;
revoke all on public.customer_love_discovery from public, anon, authenticated;

insert into public.customer_love_discovery(changed_at)
select coalesce(max(updated_at), now()) from public.customer_love where published and consent_confirmed;

create function public.touch_customer_love_discovery()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.customer_love_discovery(singleton, changed_at) values (true, now())
  on conflict (singleton) do update set changed_at = excluded.changed_at;
  return null;
end $$;
revoke all on function public.touch_customer_love_discovery() from public, anon, authenticated;

-- Same conditions as the existing site-rebuild triggers: draft-only edits do not count.
create trigger customer_love_publish_discovery after insert on public.customer_love
  for each row when (new.published) execute function public.touch_customer_love_discovery();
create trigger customer_love_update_discovery after update on public.customer_love
  for each row when (old.published or new.published) execute function public.touch_customer_love_discovery();
create trigger customer_love_delete_discovery after delete on public.customer_love
  for each row when (old.published) execute function public.touch_customer_love_discovery();

create function public.customer_love_last_changed()
returns text language sql stable security definer set search_path = ''
as $$
  select to_char(changed_at at time zone 'UTC', 'YYYY-MM-DD') from public.customer_love_discovery where singleton;
$$;
revoke all on function public.customer_love_last_changed() from public;
grant execute on function public.customer_love_last_changed() to anon, authenticated;
