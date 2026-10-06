alter table public.carts
  add column delivery_pin_code text
  check (delivery_pin_code is null or delivery_pin_code ~ '^[1-9][0-9]{5}$');

comment on column public.carts.delivery_pin_code is
  'Optional shopper-provided, unverified Indian delivery PIN. No GPS or IP location.';
