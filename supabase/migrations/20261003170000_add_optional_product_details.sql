alter table public.products
  add column if not exists materials text,
  add column if not exists dimensions text,
  add column if not exists included_items text,
  add column if not exists care_instructions text;

alter table public.products
  add constraint products_materials_length check (char_length(materials) <= 1000),
  add constraint products_dimensions_length check (char_length(dimensions) <= 1000),
  add constraint products_included_items_length check (char_length(included_items) <= 1000),
  add constraint products_care_instructions_length check (char_length(care_instructions) <= 1000);

comment on column public.products.materials is 'Optional confirmed materials; null or blank is hidden.';
comment on column public.products.dimensions is 'Optional confirmed dimensions; never estimated from a photo.';
comment on column public.products.included_items is 'Optional confirmed package contents and quantities.';
comment on column public.products.care_instructions is 'Optional confirmed care instructions.';
