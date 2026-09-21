create table if not exists public.product_variant_images (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  image_path text not null unique,
  image_url text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.product_variant_images enable row level security;

create policy "Published variant gallery images are publicly readable"
on public.product_variant_images
for select
using (
  exists (
    select 1
    from public.product_variants
    join public.products on products.id = product_variants.product_id
    where product_variants.id = product_variant_images.variant_id
      and products.published = true
  )
);

create policy "Admins can read every variant gallery image"
on public.product_variant_images
for select
to authenticated
using (public.is_catalogue_admin());

create policy "Admins can create variant gallery images"
on public.product_variant_images
for insert
to authenticated
with check (
  public.is_catalogue_admin()
  and exists (
    select 1
    from public.product_variants
    join public.products on products.id = product_variants.product_id
    where product_variants.id = product_variant_images.variant_id
      and products.created_by = auth.uid()
  )
);

create policy "Admins can delete variant gallery images"
on public.product_variant_images
for delete
to authenticated
using (
  public.is_catalogue_admin()
  and exists (
    select 1
    from public.product_variants
    join public.products on products.id = product_variants.product_id
    where product_variants.id = product_variant_images.variant_id
      and products.created_by = auth.uid()
  )
);

create index if not exists product_variant_images_variant_sort_idx
on public.product_variant_images(variant_id, sort_order, created_at);
