create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null check (
    name = btrim(name)
    and char_length(name) between 1 and 60
  ),
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  in_stock boolean not null default true,
  image_path text not null unique,
  image_url text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, name)
);

insert into public.product_variants (
  product_id,
  name,
  color,
  in_stock,
  image_path,
  image_url,
  sort_order
)
select
  id,
  'Default',
  color,
  in_stock,
  image_path,
  image_url,
  0
from public.products
where not exists (
  select 1
  from public.product_variants
  where product_variants.product_id = products.id
);

alter table public.product_variants enable row level security;

create policy "Published product variants are publicly readable"
on public.product_variants
for select
using (
  exists (
    select 1
    from public.products
    where products.id = product_variants.product_id
      and products.published = true
  )
);

create policy "Admins can read every product variant"
on public.product_variants
for select
to authenticated
using (public.is_catalogue_admin());

create policy "Admins can create product variants"
on public.product_variants
for insert
to authenticated
with check (
  public.is_catalogue_admin()
  and exists (
    select 1
    from public.products
    where products.id = product_variants.product_id
      and products.created_by = auth.uid()
  )
);

create policy "Admins can update product variants"
on public.product_variants
for update
to authenticated
using (
  public.is_catalogue_admin()
  and exists (
    select 1
    from public.products
    where products.id = product_variants.product_id
      and products.created_by = auth.uid()
  )
)
with check (
  public.is_catalogue_admin()
  and exists (
    select 1
    from public.products
    where products.id = product_variants.product_id
      and products.created_by = auth.uid()
  )
);

create policy "Admins can delete product variants"
on public.product_variants
for delete
to authenticated
using (
  public.is_catalogue_admin()
  and exists (
    select 1
    from public.products
    where products.id = product_variants.product_id
      and products.created_by = auth.uid()
  )
);

create index if not exists product_variants_product_sort_idx
on public.product_variants(product_id, sort_order, created_at);
