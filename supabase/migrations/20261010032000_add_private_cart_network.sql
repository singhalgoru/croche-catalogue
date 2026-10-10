create table public.cart_network_details (
  cart_id uuid primary key references public.carts(id) on delete cascade,
  ip_address inet not null,
  captured_at timestamptz not null default now()
);
alter table public.cart_network_details enable row level security;
revoke all on public.cart_network_details from anon, authenticated;
grant select on public.cart_network_details to authenticated;
grant all on public.cart_network_details to service_role;
create policy "Admins can read recent cart network details"
on public.cart_network_details for select to authenticated
using (public.is_catalogue_admin() and captured_at > now() - interval '30 days');

create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule(
  'purge-expired-cart-network-details',
  '17 * * * *',
  $job$delete from public.cart_network_details
    where captured_at <= now() - interval '30 days'
      or cart_id in (select id from public.carts where expires_at <= now());$job$
);
