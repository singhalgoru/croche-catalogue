-- Standard Checkout shares the existing payment-link order and item ledger.
alter table public.payment_orders
  add column is_test_checkout boolean not null default false,
  add column razorpay_order_id text unique;
alter table public.payment_orders drop constraint payment_orders_status_check;
alter table public.payment_orders add constraint payment_orders_status_check
  check (status in ('creating_link', 'link_created', 'link_failed', 'paid', 'expired',
    'cancelled', 'review_required', 'creating_checkout', 'checkout_claimed', 'checkout_created', 'test_verified'));
alter table public.payment_orders drop constraint payment_orders_check2;
alter table public.payment_orders add constraint payment_orders_link_details_check
  check (is_test_checkout or ((status not in ('creating_link', 'link_failed')) =
    (razorpay_link_id is not null and payment_url is not null)));
alter table public.payment_orders add constraint payment_orders_checkout_details_check
  check (not is_test_checkout or (
    total_paise >= 100 and razorpay_link_id is null and payment_url is null
    and status in ('creating_checkout', 'checkout_claimed', 'checkout_created', 'test_verified', 'link_failed')
    and (status not in ('checkout_created', 'test_verified') or razorpay_order_id is not null)
  ));
create policy "Shoppers can read their test checkout orders"
on public.payment_orders for select to authenticated
using (is_test_checkout and created_by = auth.uid());
create policy "Shoppers can read their test checkout items"
on public.payment_order_items for select to authenticated
using (exists (select 1 from public.payment_orders
  where payment_orders.id = payment_order_items.order_id
  and is_test_checkout and created_by = auth.uid()));

create function public.prepare_checkout_payment(
  target_cart_id uuid, owner_id uuid, request_id uuid, customer_name text, customer_phone text
)
returns public.payment_orders
language plpgsql security definer set search_path = ''
as $$
declare
  target public.carts;
  line record;
  subtotal bigint := 0;
  shipping bigint := 10000;
  item_count integer := 0;
  line_count integer := 0;
  unit_price bigint;
  reserved bigint;
  result public.payment_orders;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Backend access required.'; end if;
  if request_id is null or customer_name is null or char_length(btrim(customer_name)) not between 1 and 80
    or customer_phone is null or customer_phone !~ '^\+91[6-9][0-9]{9}$' then
    raise exception 'A request key, name and valid Indian mobile number are required.';
  end if;
  select * into target from public.carts where id = target_cart_id and user_id = owner_id
    and expires_at > now() for update;
  if target.id is null then raise exception 'An active owned cart is required.'; end if;
  perform public.check_cart_write_limit(owner_id, 'write');
  select * into result from public.payment_orders where created_by = owner_id and request_key = request_id;
  if found then
    if not result.is_test_checkout or result.cart_id is distinct from target_cart_id
      or result.customer_name is distinct from btrim(customer_name)
      or result.customer_contact is distinct from customer_phone then
      raise exception 'This request key belongs to a different checkout.';
    end if;
    return result;
  end if;
  if (select count(*) from public.payment_orders
    where created_by = owner_id and is_test_checkout and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Too many test checkouts. Please wait an hour before trying again.';
  end if;
  insert into public.payment_orders(
    reference, request_key, cart_id, created_by, customer_name, customer_contact,
    delivery_pincode, subtotal_paise, shipping_paise, total_paise, status, expires_at, is_test_checkout
  ) values (
    'TEST-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
    request_id, target.id, owner_id, btrim(customer_name), customer_phone,
    target.delivery_pin_code, 100, 0, 100, 'creating_checkout', now() + interval '24 hours', true
  ) returning * into result;
  for line in
    select ci.quantity, p.id as product_id, p.name as product_name, p.public_slug, p.published,
      p.minimum_order_quantity, p.show_price, v.id as variant_id, v.name as variant_name, v.image_url,
      v.in_stock, v.available_quantity, coalesce(v.price, p.price) as price
    from public.cart_items ci
    join public.products p on p.id = ci.product_id::uuid
    join public.product_variants v on v.id = ci.variant_id::uuid and v.product_id = p.id
    where ci.cart_id = target.id order by v.id
    for update of p, v
  loop
    select coalesce(sum(i.quantity), 0) into reserved
    from public.payment_order_items i join public.payment_orders o on o.id = i.order_id
    where i.variant_id = line.variant_id and o.status in ('creating_link', 'link_created')
      and o.expires_at > now();
    if not line.published or not line.in_stock or line.quantity > line.available_quantity - reserved
      or line.quantity < coalesce(line.minimum_order_quantity, 1) then
      raise exception 'A cart item is unavailable or has an invalid quantity.';
    end if;
    if not line.show_price or line.price is null or line.price <= 0 then
      raise exception 'All cart items need a listed price before payment.';
    end if;
    unit_price := round(line.price * 100)::bigint;
    subtotal := subtotal + unit_price * line.quantity;
    item_count := item_count + line.quantity;
    line_count := line_count + 1;
    insert into public.payment_order_items(order_id, product_id, variant_id, product_name, variant_name,
      product_public_slug, image_url, unit_price_paise, quantity)
    values (result.id, line.product_id, line.variant_id, line.product_name, line.variant_name,
      line.public_slug, line.image_url, unit_price, line.quantity);
  end loop;
  if item_count = 0 or line_count <> (select count(*) from public.cart_items where cart_id = target.id) then
    raise exception 'Add available products before payment.';
  end if;
  if subtotal >= 50000 then shipping := 0;
  elsif target.delivery_pin_code is not null and target.delivery_estimate is not null
    and (target.delivery_estimate->>'itemCount')::integer = item_count then
    shipping := ceil((target.delivery_estimate->>'minCharge')::numeric / 10)::bigint * 1000;
  end if;
  if shipping is null or shipping < 0 or subtotal + shipping not between 100 and 100000000 then
    raise exception 'Payment amount must be between 100 and 100000000 paise.';
  end if;
  update public.payment_orders set subtotal_paise = subtotal, shipping_paise = shipping,
    total_paise = subtotal + shipping where id = result.id returning * into result;
  return result;
end;
$$;
revoke all on function public.prepare_checkout_payment(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.prepare_checkout_payment(uuid, uuid, uuid, text, text) to service_role;

-- A test payment is not a purchase and must never consume real inventory.
create function public.verify_test_checkout(order_id uuid, owner_id uuid, payment_id text)
returns void language plpgsql security definer set search_path = ''
as $$
declare target public.payment_orders;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Backend access required.'; end if;
  if exists (select 1 from public.cart_session_blocks where user_id = owner_id) then
    raise exception 'This cart session has been blocked.';
  end if;
  select * into target from public.payment_orders
  where id = order_id and created_by = owner_id and is_test_checkout for update;
  if not found then raise exception 'Test checkout not found.'; end if;
  if target.status = 'test_verified' and target.razorpay_payment_id = payment_id then return; end if;
  if target.status <> 'checkout_created' or payment_id !~ '^pay_[A-Za-z0-9]+$' then
    raise exception 'Test checkout cannot be verified.';
  end if;
  update public.payment_orders set status = 'test_verified', razorpay_payment_id = payment_id,
    updated_at = now() where id = target.id;
end;
$$;
revoke all on function public.verify_test_checkout(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.verify_test_checkout(uuid, uuid, text) to service_role;
