create table public.pinterest_variant_images (
  variant_id uuid primary key references public.product_variants(id) on delete cascade,
  image_path text not null unique check (image_path ~ '^r2:products/[a-zA-Z0-9-]+/[a-zA-Z0-9-]+$'),
  image_url text not null check (image_url = 'https://images.luviacreations.com/' || substring(image_path from 4) || '.webp'),
  revision uuid not null default gen_random_uuid(),
  updated_at timestamptz not null default now()
);

alter table public.pinterest_variant_images enable row level security;
revoke all on public.pinterest_variant_images from public, anon, authenticated;
grant select on public.pinterest_variant_images to anon, authenticated;
grant insert, update, delete on public.pinterest_variant_images to authenticated;
grant all on public.pinterest_variant_images to service_role;

create policy "Published Pinterest images are publicly readable"
on public.pinterest_variant_images for select to anon, authenticated
using (exists (
  select 1 from public.product_variants v
  join public.products p on p.id = v.product_id
  where v.id = pinterest_variant_images.variant_id and p.published
));

create policy "Verified admins can read Pinterest images"
on public.pinterest_variant_images for select to authenticated
using (public.is_catalogue_admin());

create policy "Verified admins can insert Pinterest images"
on public.pinterest_variant_images for insert to authenticated
with check (public.is_catalogue_admin());

create policy "Verified admins can update Pinterest images"
on public.pinterest_variant_images for update to authenticated
using (public.is_catalogue_admin()) with check (public.is_catalogue_admin());

create policy "Verified admins can delete Pinterest images"
on public.pinterest_variant_images for delete to authenticated
using (public.is_catalogue_admin());

create trigger request_site_rebuild
after insert or update or delete on public.pinterest_variant_images
for each statement execute function public.request_site_rebuild();
