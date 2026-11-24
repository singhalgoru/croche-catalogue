create table public.dtdc_sandbox_bookings (
  id uuid primary key,
  customer_reference text not null unique,
  actor_id uuid not null,
  state text not null check (state in ('pending', 'review', 'booked', 'cleared')),
  awb text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((state = 'booked' and awb is not null) or (state <> 'booked' and awb is null))
);

create unique index dtdc_sandbox_one_unresolved_booking
  on public.dtdc_sandbox_bookings ((true)) where state in ('pending', 'review');

alter table public.dtdc_sandbox_bookings enable row level security;
revoke all on public.dtdc_sandbox_bookings from public, anon, authenticated;
grant select, insert, update on public.dtdc_sandbox_bookings to service_role;
