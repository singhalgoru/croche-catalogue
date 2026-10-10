alter table public.cart_network_details
add column location jsonb;

insert into storage.buckets (id, name, public, file_size_limit)
values ('geolocation-private', 'geolocation-private', false, 104857600)
on conflict (id) do nothing;
