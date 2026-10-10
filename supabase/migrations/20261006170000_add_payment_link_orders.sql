create table public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  request_key uuid not null,
  cart_id uuid references public.carts(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  customer_name text not null check (char_length(customer_name) between 1 and 80),
  customer_contact text not null check (customer_contact ~ '^\+91[6-9][0-9]{9}$'),
  customer_email text check (
    customer_email is null
    or (char_length(customer_email) <= 254 and customer_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
  ),
  delivery_pincode text check (
    delivery_pincode is null or delivery_pincode ~ '^[1-9][0-9]{5}$'
  ),
  subtotal_paise bigint not null check (subtotal_paise > 0),
  shipping_paise bigint not null check (shipping_paise >= 0),
  total_paise bigint not null check (total_paise = subtotal_paise + shipping_paise),
  currency text not null default 'INR' check (currency = 'INR'),
  status text not null default 'creating_link'
    check (status in ('creating_link', 'link_created', 'link_failed', 'paid', 'expired', 'cancelled', 'review_required')),
  razorpay_link_id text unique,
  razorpay_payment_id text unique,
  payment_url text,
  expires_at timestamptz not null,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (created_by, request_key),
  check ((status = 'paid') = (paid_at is not null)),
  check ((status not in ('creating_link', 'link_failed')) =
    (razorpay_link_id is not null and payment_url is not null))
);

create index payment_orders_active_reservations_idx
  on public.payment_orders(expires_at)
  where status in ('creating_link', 'link_created');

create table public.payment_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.payment_orders(id) on delete cascade,
  product_id uuid not null,
  variant_id uuid not null,
  product_name text not null,
  variant_name text not null,
  product_public_slug text,
  image_url text not null,
  unit_price_paise bigint not null check (unit_price_paise > 0),
  quantity integer not null check (quantity between 1 and 99),
  line_total_paise bigint generated always as (unit_price_paise * quantity) stored
);

create index payment_order_items_order_idx on public.payment_order_items(order_id);
create index payment_order_items_variant_idx on public.payment_order_items(variant_id);

create table public.payment_webhook_events (
  event_id text primary key,
  event_name text not null,
  received_at timestamptz not null default now()
);
alter table public.payment_orders enable row level security;
alter table public.payment_order_items enable row level security;
alter table public.payment_webhook_events enable row level security;

create policy "Catalogue admins can read payment orders"
on public.payment_orders for select to authenticated
using (public.is_catalogue_admin());

create policy "Catalogue admins can read payment order items"
on public.payment_order_items for select to authenticated
using (
  exists (
    select 1 from public.payment_orders
    where payment_orders.id = payment_order_items.order_id
      and public.is_catalogue_admin()
  )
);

revoke all on public.payment_orders, public.payment_order_items, public.payment_webhook_events
  from public, anon, authenticated;
grant select on public.payment_orders, public.payment_order_items to authenticated;
grant all on public.payment_orders, public.payment_order_items, public.payment_webhook_events to service_role;

create function public.prepare_payment_link_order(
  p_cart_id uuid,
  p_request_key uuid,
  p_customer_name text,
  p_customer_contact text,
  p_customer_email text,
  p_shipping_paise bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_order public.payment_orders%rowtype;
  cart_row public.carts%rowtype;
  cart_item record;
  product_row record;
  order_id uuid;
  order_reference text;
  subtotal bigint := 0;
  total_quantity integer := 0;
  reserved_quantity bigint;
  unit_price bigint;
  shipping bigint;
  new_order public.payment_orders%rowtype;
begin
  if not public.is_catalogue_admin() then
    raise exception 'Only catalogue admins can issue payment links.';
  end if;
  if p_request_key is null or p_cart_id is null then
    raise exception 'A cart and idempotency key are required.';
  end if;
  if p_customer_name is null or char_length(btrim(p_customer_name)) not between 1 and 80 then
    raise exception 'Enter a customer name of 1 to 80 characters.';
  end if;
  if p_customer_contact is null or p_customer_contact !~ '^\+91[6-9][0-9]{9}$' then
    raise exception 'Enter a valid Indian mobile number.';
  end if;
  if p_customer_email is not null and (
    char_length(p_customer_email) > 254
    or p_customer_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ) then
    raise exception 'Enter a valid email address or leave it empty.';
  end if;
  if p_shipping_paise is null or p_shipping_paise < 0 or p_shipping_paise > 100000000 then
    raise exception 'Shipping must be between ₹0 and ₹1,000,000.';
  end if;

  select * into existing_order
  from public.payment_orders
  where created_by = auth.uid() and request_key = p_request_key
  for update;
  if found then
    if existing_order.cart_id is distinct from p_cart_id
      or existing_order.customer_name is distinct from btrim(p_customer_name)
      or existing_order.customer_contact is distinct from p_customer_contact
      or existing_order.customer_email is distinct from nullif(btrim(p_customer_email), '')
      or existing_order.shipping_paise is distinct from p_shipping_paise then
      raise exception 'This idempotency key was already used for a different order request.';
    end if;
    return jsonb_build_object(
      'id', existing_order.id,
      'reference', existing_order.reference,
      'status', existing_order.status,
      'payment_url', existing_order.payment_url,
      'razorpay_link_id', existing_order.razorpay_link_id,
      'total_paise', existing_order.total_paise,
      'expires_at', existing_order.expires_at,
      'reused', true
    );
  end if;

  select * into cart_row
  from public.carts
  where id = p_cart_id and expires_at > now()
  for update;
  if not found then
    raise exception 'This cart is no longer active.';
  end if;

  select * into existing_order
  from public.payment_orders
  where cart_id = p_cart_id and status = 'paid'
  order by created_at desc
  limit 1
  for update;
  if found then
    raise exception 'This cart already has a paid order (%). Start a new cart for another order.', existing_order.reference;
  end if;

  select * into existing_order
  from public.payment_orders
  where cart_id = p_cart_id
    and status in ('creating_link', 'link_created')
    and expires_at > now()
  order by created_at desc
  limit 1
  for update;
  if found then
    raise exception 'This cart already has a pending payment link (%). Reuse that link or check Razorpay before creating another.', existing_order.reference;
  end if;

  if not exists (select 1 from public.cart_items where cart_id = p_cart_id) then
    raise exception 'Add at least one item to the cart before issuing a payment link.';
  end if;

  order_id := gen_random_uuid();
  order_reference := 'LUV-' || upper(substr(replace(order_id::text, '-', ''), 1, 10));
  shipping := p_shipping_paise;

  insert into public.payment_orders (
    id, reference, request_key, cart_id, created_by,
    customer_name, customer_contact, customer_email, delivery_pincode,
    subtotal_paise, shipping_paise, total_paise, status, expires_at
  ) values (
    order_id, order_reference, p_request_key, p_cart_id, auth.uid(),
    btrim(p_customer_name), p_customer_contact, nullif(btrim(p_customer_email), ''),
    cart_row.delivery_pin_code, 1, shipping, 1 + shipping, 'creating_link', now() + interval '24 hours'
  );

  for cart_item in
    select product_id, variant_id, quantity
    from public.cart_items
    where cart_id = p_cart_id
    order by variant_id
  loop
    select p.id as product_id, p.name as product_name, p.public_slug,
      p.published, p.show_price, p.in_stock as product_in_stock,
      v.id as variant_id, v.name as variant_name, v.image_url,
      v.price as variant_price, v.in_stock as variant_in_stock,
      v.available_quantity, p.price as product_price
    into product_row
    from public.products p
    join public.product_variants v on v.product_id = p.id
    where p.id = cart_item.product_id::uuid
      and v.id = cart_item.variant_id::uuid
    for update of p, v;

    if not found then
      raise exception 'A cart item is no longer published. Refresh the catalogue and confirm the order again.';
    end if;
    if not product_row.published then
      raise exception 'A cart item is no longer published. Refresh the catalogue and confirm the order again.';
    end if;
    if not product_row.show_price then
      raise exception 'A cart item is price-on-request and cannot be charged by payment link.';
    end if;
    unit_price := coalesce(product_row.variant_price, product_row.product_price)::bigint * 100;
    if unit_price is null or unit_price <= 0 then
      raise exception 'A cart item has no valid price.';
    end if;
    if not product_row.product_in_stock or not product_row.variant_in_stock then
      raise exception 'A cart item is out of stock.';
    end if;

    select coalesce(sum(items.quantity), 0) into reserved_quantity
    from public.payment_order_items items
    join public.payment_orders orders on orders.id = items.order_id
    where items.variant_id = product_row.variant_id
      and orders.status in ('creating_link', 'link_created')
      and orders.expires_at > now();
    if product_row.available_quantity - reserved_quantity < cart_item.quantity then
      raise exception 'There is not enough available stock for %.', product_row.product_name;
    end if;

    insert into public.payment_order_items (
      order_id, product_id, variant_id, product_name, variant_name,
      product_public_slug, image_url, unit_price_paise, quantity
    ) values (
      order_id, product_row.product_id, product_row.variant_id,
      product_row.product_name, product_row.variant_name,
      product_row.public_slug, product_row.image_url, unit_price, cart_item.quantity
    );
    subtotal := subtotal + unit_price * cart_item.quantity;
    total_quantity := total_quantity + cart_item.quantity;
  end loop;

  if total_quantity < 1 or subtotal > 10000000000 then
    raise exception 'The order total is outside the supported range.';
  end if;

  update public.payment_orders
  set subtotal_paise = subtotal,
      total_paise = subtotal + shipping,
      updated_at = now()
  where id = order_id
  returning * into new_order;

  return jsonb_build_object(
    'id', new_order.id,
    'reference', new_order.reference,
    'status', new_order.status,
    'payment_url', new_order.payment_url,
    'razorpay_link_id', new_order.razorpay_link_id,
    'total_paise', new_order.total_paise,
    'expires_at', new_order.expires_at,
    'reused', false
  );
end;
$$;

revoke all on function public.prepare_payment_link_order(uuid, uuid, text, text, text, bigint)
  from public, anon;
grant execute on function public.prepare_payment_link_order(uuid, uuid, text, text, text, bigint)
  to authenticated;

create function public.record_razorpay_payment_event(
  p_event_id text,
  p_event_name text,
  p_link_id text,
  p_payment_id text,
  p_amount_paise bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_order public.payment_orders%rowtype;
  item record;
  available integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Payment webhook processing requires service role.';
  end if;
  if p_event_id is null or char_length(p_event_id) not between 1 and 200
    or p_link_id is null or char_length(p_link_id) not between 1 and 100 then
    raise exception 'Payment event identifiers are invalid.';
  end if;
  if p_event_name not in ('payment_link.paid', 'payment_link.expired', 'payment_link.cancelled') then
    return jsonb_build_object('processed', false, 'reason', 'unsupported_event');
  end if;

  select * into target_order from public.payment_orders
  where razorpay_link_id = p_link_id
  for update;
  if not found then
    return jsonb_build_object('processed', false, 'reason', 'unknown_payment_link');
  end if;

  insert into public.payment_webhook_events(event_id, event_name)
  values (p_event_id, p_event_name)
  on conflict (event_id) do nothing;
  if not found then
    return jsonb_build_object('processed', false, 'duplicate', true);
  end if;

  if p_event_name = 'payment_link.expired' then
    update public.payment_orders
    set status = 'expired', updated_at = now()
    where id = target_order.id and status in ('creating_link', 'link_created');
    return jsonb_build_object('processed', true, 'status', case when target_order.status = 'paid' then 'paid' else 'expired' end);
  end if;

  if p_event_name = 'payment_link.cancelled' then
    update public.payment_orders
    set status = 'cancelled', updated_at = now()
    where id = target_order.id and status in ('creating_link', 'link_created');
    return jsonb_build_object('processed', true, 'status', case when target_order.status = 'paid' then 'paid' else 'cancelled' end);
  end if;

  if p_payment_id is null or char_length(p_payment_id) not between 1 and 100
    or p_amount_paise is distinct from target_order.total_paise then
    update public.payment_orders
    set status = 'review_required',
        razorpay_payment_id = case when p_payment_id is not null then p_payment_id else razorpay_payment_id end,
        updated_at = now()
    where id = target_order.id and status <> 'paid';
    return jsonb_build_object('processed', true, 'status', 'review_required');
  end if;

  if target_order.status = 'paid' then
    if target_order.razorpay_payment_id = p_payment_id then
      return jsonb_build_object('processed', true, 'status', 'paid', 'duplicate_payment', true);
    end if;
    update public.payment_orders
    set status = 'review_required', razorpay_payment_id = p_payment_id, updated_at = now()
    where id = target_order.id;
    return jsonb_build_object('processed', true, 'status', 'review_required');
  end if;

  if target_order.status not in ('link_created', 'creating_link')
    or target_order.expires_at <= now() then
    update public.payment_orders set status = 'review_required', updated_at = now()
    where id = target_order.id;
    return jsonb_build_object('processed', true, 'status', 'review_required');
  end if;

  for item in
    select variant_id, quantity
    from public.payment_order_items
    where order_id = target_order.id
    order by variant_id
  loop
    select available_quantity into available
    from public.product_variants
    where id = item.variant_id
    for update;
    if not found or available < item.quantity then
      update public.payment_orders
      set status = 'review_required', razorpay_payment_id = p_payment_id, updated_at = now()
      where id = target_order.id;
      return jsonb_build_object('processed', true, 'status', 'review_required');
    end if;
  end loop;

  for item in
    select variant_id, product_id, quantity
    from public.payment_order_items
    where order_id = target_order.id
    order by variant_id
  loop
    update public.product_variants
    set available_quantity = available_quantity - item.quantity,
        in_stock = available_quantity - item.quantity > 0,
        updated_at = now()
    where id = item.variant_id;
    update public.products
    set in_stock = exists (
      select 1 from public.product_variants
      where product_id = products.id and in_stock
    ), updated_at = now()
    where id = item.product_id;
  end loop;

  update public.payment_orders
  set status = 'paid',
      razorpay_payment_id = p_payment_id,
      paid_at = now(),
      updated_at = now()
  where id = target_order.id;

  return jsonb_build_object('processed', true, 'status', 'paid');
end;
$$;

revoke all on function public.record_razorpay_payment_event(text, text, text, text, bigint)
  from public, anon, authenticated;
grant execute on function public.record_razorpay_payment_event(text, text, text, text, bigint)
  to service_role;
