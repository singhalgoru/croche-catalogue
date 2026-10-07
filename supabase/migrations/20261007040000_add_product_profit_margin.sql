alter table public.products
add column if not exists profit_margin_percent numeric(7, 3);

alter table public.products
drop constraint if exists products_profit_margin_percent_valid;

alter table public.products
add constraint products_profit_margin_percent_valid
check (profit_margin_percent is null or profit_margin_percent <= 100);
