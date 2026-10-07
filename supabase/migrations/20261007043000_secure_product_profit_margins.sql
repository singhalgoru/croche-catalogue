create table if not exists public.product_profit_margins (
  product_id uuid primary key references public.products(id) on delete cascade,
  profit_margin_percent numeric not null check (profit_margin_percent <= 100),
  updated_at timestamptz not null default now()
);

insert into public.product_profit_margins (product_id, profit_margin_percent)
select id, profit_margin_percent
from public.products
where profit_margin_percent is not null
on conflict (product_id) do update
set profit_margin_percent = excluded.profit_margin_percent;

alter table public.products
drop column if exists profit_margin_percent;

alter table public.product_profit_margins enable row level security;

revoke all on public.product_profit_margins from public;
grant select on public.product_profit_margins to anon, authenticated;
grant insert, update, delete on public.product_profit_margins to authenticated;

create policy "Catalogue admins can read product profit margins"
on public.product_profit_margins
for select
to authenticated
using (public.is_catalogue_admin());

create policy "Catalogue admins can insert product profit margins"
on public.product_profit_margins
for insert
to authenticated
with check (public.is_catalogue_admin());

create policy "Catalogue admins can update product profit margins"
on public.product_profit_margins
for update
to authenticated
using (public.is_catalogue_admin())
with check (public.is_catalogue_admin());

create policy "Catalogue admins can delete product profit margins"
on public.product_profit_margins
for delete
to authenticated
using (public.is_catalogue_admin());
