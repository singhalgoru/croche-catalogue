alter table public.products
add column if not exists price integer;

alter table public.products
add column if not exists show_price boolean not null default false;

alter table public.products
drop constraint if exists products_price_positive;

alter table public.products
add constraint products_price_positive check (price is null or price >= 0);
