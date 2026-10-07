alter table public.products
  add column minimum_order_quantity integer not null default 1
  check (minimum_order_quantity between 1 and 99);
