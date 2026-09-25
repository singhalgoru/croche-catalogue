create table if not exists public.ticker_messages (
  id uuid primary key default gen_random_uuid(),
  message text not null check (
    message = btrim(message)
    and char_length(message) between 2 and 160
  ),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.ticker_messages (message, is_active, sort_order)
select '🚚 Shipping available across India', true, 0
where not exists (select 1 from public.ticker_messages);

alter table public.ticker_messages enable row level security;

create policy "Active ticker messages are publicly readable"
on public.ticker_messages
for select
using (is_active or public.is_catalogue_admin());

create policy "Admins can create ticker messages"
on public.ticker_messages
for insert
to authenticated
with check (public.is_catalogue_admin());

create policy "Admins can update ticker messages"
on public.ticker_messages
for update
to authenticated
using (public.is_catalogue_admin())
with check (public.is_catalogue_admin());

create policy "Admins can delete ticker messages"
on public.ticker_messages
for delete
to authenticated
using (public.is_catalogue_admin());

create index if not exists ticker_messages_display_idx
on public.ticker_messages (is_active, sort_order, created_at);
