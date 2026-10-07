alter table public.product_profit_margins
add column if not exists gst_percent numeric
check (gst_percent is null or gst_percent between 0 and 100);
