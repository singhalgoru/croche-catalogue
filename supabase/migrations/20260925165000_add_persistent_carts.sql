create table if not exists public.carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  reference text not null unique default (
    'CRT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
  ),
  status text not null default 'active'
    check (status in ('active', 'whatsapp_started')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  whatsapp_started_at timestamptz
);

create table if not exists public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts(id) on delete cascade,
  product_id text not null,
  variant_id text not null,
  product_name text not null check (char_length(product_name) between 1 and 100),
  variant_name text not null check (char_length(variant_name) between 1 and 60),
  image_url text not null,
  unit_price integer check (unit_price is null or unit_price >= 0),
  quantity integer not null default 1 check (quantity between 1 and 99),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cart_id, product_id, variant_id)
);

create index if not exists carts_activity_idx
on public.carts(updated_at desc);

create index if not exists cart_items_cart_idx
on public.cart_items(cart_id, created_at);

alter table public.carts enable row level security;
alter table public.cart_items enable row level security;

create policy "Customers can read their own cart"
on public.carts
for select
to authenticated
using (user_id = auth.uid());

create policy "Customers can create their own cart"
on public.carts
for insert
to authenticated
with check (user_id = auth.uid());

create policy "Customers can update their own cart"
on public.carts
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Customers can read their own cart items"
on public.cart_items
for select
to authenticated
using (
  exists (
    select 1
    from public.carts
    where carts.id = cart_items.cart_id
      and carts.user_id = auth.uid()
  )
);

create policy "Customers can add their own cart items"
on public.cart_items
for insert
to authenticated
with check (
  exists (
    select 1
    from public.carts
    where carts.id = cart_items.cart_id
      and carts.user_id = auth.uid()
  )
);

create policy "Customers can update their own cart items"
on public.cart_items
for update
to authenticated
using (
  exists (
    select 1
    from public.carts
    where carts.id = cart_items.cart_id
      and carts.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.carts
    where carts.id = cart_items.cart_id
      and carts.user_id = auth.uid()
  )
);

create policy "Customers can delete their own cart items"
on public.cart_items
for delete
to authenticated
using (
  exists (
    select 1
    from public.carts
    where carts.id = cart_items.cart_id
      and carts.user_id = auth.uid()
  )
);

create policy "Catalogue admins can read all carts"
on public.carts
for select
to authenticated
using (public.is_catalogue_admin());

create policy "Catalogue admins can read all cart items"
on public.cart_items
for select
to authenticated
using (public.is_catalogue_admin());
