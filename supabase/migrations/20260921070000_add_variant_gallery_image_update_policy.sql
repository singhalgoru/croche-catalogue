-- The initial gallery-images migration only granted admins select/insert/
-- delete on product_variant_images, so swapping a gallery photo into the
-- main-image slot (setVariantMainImage in services/products.ts) silently
-- failed to update the gallery row under RLS: Postgres/PostgREST does not
-- raise an error when an UPDATE matches zero rows, it just reports success
-- with no rows changed. The variant's main image still swapped correctly,
-- but the old main image was never written back into the gallery row, so
-- it became an orphaned file no longer referenced anywhere.
create policy "Admins can update variant gallery images"
on public.product_variant_images
for update
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
)
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
