alter table public.product_variants
  add column if not exists price integer;

alter table public.product_variants
  drop constraint if exists product_variants_price_non_negative;

alter table public.product_variants
  add constraint product_variants_price_non_negative
  check (price is null or price >= 0);
