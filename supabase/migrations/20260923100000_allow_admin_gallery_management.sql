-- Gallery images are catalogue assets, so any authenticated catalogue admin
-- who can manage the catalogue must be able to update or remove them.
-- Restricting these policies to products.created_by made images visible to
-- admins but undeletable when the product was created by another admin.

drop policy if exists "Admins can delete variant gallery images"
on public.product_variant_images;

create policy "Admins can delete variant gallery images"
on public.product_variant_images
for delete
to authenticated
using (
  public.is_catalogue_admin()
  and exists (
    select 1
    from public.product_variants
    where product_variants.id = product_variant_images.variant_id
  )
);

drop policy if exists "Admins can update variant gallery images"
on public.product_variant_images;

create policy "Admins can update variant gallery images"
on public.product_variant_images
for update
to authenticated
using (
  public.is_catalogue_admin()
  and exists (
    select 1
    from public.product_variants
    where product_variants.id = product_variant_images.variant_id
  )
)
with check (
  public.is_catalogue_admin()
  and exists (
    select 1
    from public.product_variants
    where product_variants.id = product_variant_images.variant_id
  )
);
