alter table public.product_profit_margins
  alter column profit_margin_percent drop not null,
  add column if not exists time_spent numeric check (time_spent is null or time_spent >= 0),
  add column if not exists time_unit text check (time_unit is null or time_unit in ('hours', 'minutes')),
  add column if not exists material_cost numeric check (material_cost is null or material_cost >= 0),
  add column if not exists shipping_cost numeric check (shipping_cost is null or shipping_cost >= 0),
  add column if not exists packaging_cost numeric check (packaging_cost is null or packaging_cost >= 0),
  add column if not exists target_margin_percent numeric
    check (target_margin_percent is null or target_margin_percent >= 0 and target_margin_percent < 100);
