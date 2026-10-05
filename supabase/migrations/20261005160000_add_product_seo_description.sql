alter table public.products
  add column seo_description text;

alter table public.products
  add constraint products_seo_description_length
  check (seo_description is null or char_length(seo_description) <= 160);

comment on column public.products.seo_description is
  'Optional admin-reviewed search and social summary; null uses the automatic product summary.';
