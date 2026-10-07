create table public.seller_sales (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete set null,
  product_name text not null check (char_length(product_name) between 1 and 150),
  variant_name text not null default '' check (char_length(variant_name) <= 100),
  sale_date date not null default current_date,
  channel text not null check (channel in ('online', 'offline', 'whatsapp', 'instagram', 'other')),
  quantity integer not null check (quantity between 1 and 100000),
  unit_price numeric(12, 2) not null check (unit_price > 0),
  gst_percent numeric(5, 2) not null default 5 check (gst_percent between 0 and 100),
  material_cost numeric(12, 2) not null default 0 check (material_cost >= 0),
  labour_cost numeric(12, 2) not null default 0 check (labour_cost >= 0),
  packaging_cost numeric(12, 2) not null default 0 check (packaging_cost >= 0),
  shipping_cost numeric(12, 2) not null default 0 check (shipping_cost >= 0),
  gateway_fee_percent numeric(5, 2) not null default 0 check (gateway_fee_percent between 0 and 100),
  gateway_fee_gst_percent numeric(5, 2) not null default 18 check (gateway_fee_gst_percent between 0 and 100),
  notes text not null default '' check (char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index seller_sales_sale_date_idx on public.seller_sales (sale_date desc, created_at desc);
alter table public.seller_sales enable row level security;

create policy "Catalogue admins can read seller sales"
on public.seller_sales
for select
to authenticated
using (public.is_catalogue_admin());

create policy "Catalogue admins can create seller sales"
on public.seller_sales
for insert
to authenticated
with check (public.is_catalogue_admin());

create policy "Catalogue admins can update seller sales"
on public.seller_sales
for update
to authenticated
using (public.is_catalogue_admin())
with check (public.is_catalogue_admin());

create policy "Catalogue admins can delete seller sales"
on public.seller_sales
for delete
to authenticated
using (public.is_catalogue_admin());
