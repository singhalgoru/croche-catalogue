-- Supabase stops granting Data API access to new public tables automatically.
-- These older tables relied on that default, so declare the access their RLS
-- policies already intend. Grants are idempotent and RLS still limits rows.

grant select on public.products, public.categories, public.product_variants,
  public.product_variant_images, public.ticker_messages to anon;

grant select, insert, update, delete on public.products, public.categories,
  public.product_variants, public.product_variant_images,
  public.ticker_messages, public.carts, public.cart_items,
  public.seller_sales, public.business_expenses to authenticated;

grant select on public.catalogue_admins to authenticated;

grant all on public.products, public.categories, public.product_variants,
  public.product_variant_images, public.ticker_messages, public.carts,
  public.cart_items, public.seller_sales, public.business_expenses,
  public.catalogue_admins to service_role;
