create extension if not exists "pgcrypto";

create table if not exists public.catalogue_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.catalogue_admins enable row level security;

create policy "Admins can verify their own access"
on public.catalogue_admins
for select
to authenticated
using (user_id = auth.uid());

create or replace function public.is_catalogue_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.catalogue_admins
    where user_id = auth.uid()
  );
$$;

revoke all on function public.is_catalogue_admin() from public;
grant execute on function public.is_catalogue_admin() to authenticated;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 100),
  category text not null check (
    category in (
      'Hair Accessories',
      'Rakhi',
      'Anklets',
      'Brooches',
      'Charms & Keychains',
      'Festive Decor',
      'Toys'
    )
  ),
  description text not null check (char_length(description) between 10 and 1000),
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  in_stock boolean not null default true,
  image_path text not null unique,
  image_url text not null,
  published boolean not null default true,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.products enable row level security;

create policy "Published products are publicly readable"
on public.products
for select
using (published = true);

create policy "Authenticated admins can read every product"
on public.products
for select
to authenticated
using (public.is_catalogue_admin());

create policy "Authenticated admins can create products"
on public.products
for insert
to authenticated
with check (public.is_catalogue_admin() and created_by = auth.uid());

create policy "Authenticated admins can update their products"
on public.products
for update
to authenticated
using (public.is_catalogue_admin() and created_by = auth.uid())
with check (public.is_catalogue_admin() and created_by = auth.uid());

create policy "Authenticated admins can delete their products"
on public.products
for delete
to authenticated
using (public.is_catalogue_admin() and created_by = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  6291456,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Product images are publicly readable"
on storage.objects
for select
using (bucket_id = 'product-images');

create policy "Authenticated admins can upload product images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'product-images'
  and public.is_catalogue_admin()
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Authenticated admins can update their product images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'product-images'
  and public.is_catalogue_admin()
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'product-images'
  and public.is_catalogue_admin()
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Authenticated admins can delete their product images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'product-images'
  and public.is_catalogue_admin()
  and (storage.foldername(name))[1] = auth.uid()::text
);
