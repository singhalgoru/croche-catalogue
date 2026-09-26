update public.product_variants
set
  name = 'Standard',
  updated_at = now()
where lower(btrim(name)) = 'default';
