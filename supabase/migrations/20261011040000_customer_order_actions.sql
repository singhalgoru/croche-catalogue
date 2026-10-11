create table public.customer_hidden_orders (
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid not null references public.payment_orders(id) on delete cascade,
  primary key (user_id, order_id)
);
alter table public.customer_hidden_orders enable row level security;
revoke all on public.customer_hidden_orders from public, anon, authenticated;
grant all on public.customer_hidden_orders to service_role;

create function public.customer_owns_order(target_order_id uuid)
returns boolean language sql security definer set search_path = ''
as $$
  select exists (
    select 1 from public.payment_orders o join auth.users u on u.id = auth.uid()
    where o.id = target_order_id and not o.is_test_checkout
      and u.email_confirmed_at is not null and not coalesce(u.is_anonymous, false)
      and (o.customer_user_id = u.id or lower(o.customer_email) = lower(u.email))
  );
$$;
revoke all on function public.customer_owns_order(uuid) from public, anon, authenticated;

create function public.set_customer_order_hidden(target_order_id uuid, hide_order boolean)
returns void language plpgsql security definer set search_path = ''
as $$
declare o public.payment_orders;
begin
  if hide_order is null or not public.customer_owns_order(target_order_id) then
    raise exception 'An owned customer order is required.';
  end if;
  select * into o from public.payment_orders where id = target_order_id for update;
  if hide_order then
    if not (o.status in ('cancelled', 'expired') or (o.status = 'link_created' and o.expires_at <= now()))
      or o.paid_at is not null then
      raise exception 'Only cancelled or expired unpaid orders can be hidden.';
    end if;
    insert into public.customer_hidden_orders values (auth.uid(), o.id) on conflict do nothing;
  else
    delete from public.customer_hidden_orders where user_id = auth.uid() and order_id = o.id;
  end if;
end;
$$;
revoke all on function public.set_customer_order_hidden(uuid, boolean) from public, anon;
grant execute on function public.set_customer_order_hidden(uuid, boolean) to authenticated;

drop function public.get_customer_orders(integer);
create function public.get_customer_orders(page_offset integer default 0, hidden_orders boolean default false)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare customer_id uuid := auth.uid(); verified_email text; result jsonb;
begin
  select lower(email) into verified_email from auth.users where id = customer_id
    and email_confirmed_at is not null and not coalesce(is_anonymous, false);
  if verified_email is null then raise exception 'Sign in with a verified email to view your orders.'; end if;
  if page_offset is null or page_offset < 0 or hidden_orders is null then raise exception 'Invalid order history page.'; end if;
  select coalesce(jsonb_agg(entry order by rank, created_at desc, id desc), '[]'::jsonb) into result
  from (
    select o.id, o.created_at,
      case when h.order_id is not null then 3
        when o.status = 'paid' and o.fulfilment_status <> 'delivered' then 0
        when o.status = 'review_required' or (o.status in ('creating_link', 'link_created') and o.expires_at > now()) then 1 else 2 end as rank,
      jsonb_build_object(
        'id', o.id, 'reference', o.reference,
        'status', case when o.status = 'link_created' and o.expires_at <= now() then 'expired' else o.status end,
        'createdAt', o.created_at,
        'paidAt', o.paid_at, 'expiresAt', o.expires_at, 'hidden', h.order_id is not null,
        'customerName', o.customer_name, 'deliveryPincode', o.delivery_pincode,
        'deliveryDetails', o.delivery_details, 'subtotal', o.subtotal_paise / 100.0,
        'discount', o.discount_paise / 100.0, 'shipping', o.shipping_paise / 100.0,
        'total', o.total_paise / 100.0,
        'fulfilment', case when o.is_live_checkout and o.status = 'paid' then jsonb_build_object(
          'status', o.fulfilment_status, 'courierName', o.courier_name, 'trackingNumber', o.tracking_number,
          'trackingUrl', o.tracking_url, 'updatedAt', o.fulfilment_updated_at) else null end,
        'items', coalesce((select jsonb_agg(jsonb_build_object(
          'id', i.id, 'productName', i.product_name, 'variantName', i.variant_name,
          'quantity', i.quantity, 'unitPrice', i.unit_price_paise / 100.0,
          'lineTotal', i.line_total_paise / 100.0
        ) order by i.id) from public.payment_order_items i where i.order_id = o.id), '[]'::jsonb)
      ) as entry
    from public.payment_orders o left join public.customer_hidden_orders h
      on h.order_id = o.id and h.user_id = customer_id and o.paid_at is null
        and (o.status in ('cancelled','expired') or (o.status = 'link_created' and o.expires_at <= now()))
    where not o.is_test_checkout and (o.customer_user_id = customer_id or lower(o.customer_email) = verified_email)
      and (h.order_id is not null) = hidden_orders
    order by rank, o.created_at desc, o.id desc limit 20 offset page_offset
  ) history;
  return result;
end;
$$;
revoke all on function public.get_customer_orders(integer,boolean) from public, anon;
grant execute on function public.get_customer_orders(integer,boolean) to authenticated;

create function public.reorder_customer_order(target_order_id uuid, target_cart_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare c public.carts; o public.payment_orders; line record; current_item public.cart_items;
  requested integer; reserved bigint; added integer := 0; skipped jsonb := '[]'::jsonb; reason text;
begin
  if not public.customer_owns_order(target_order_id) then raise exception 'An owned customer order is required.'; end if;
  select * into c from public.carts where id = target_cart_id and user_id = auth.uid() and expires_at > now() for update;
  if not found then raise exception 'An active owned cart is required.'; end if;
  select * into o from public.payment_orders where id = target_order_id;
  if o.status = 'review_required' or (o.status in ('creating_link','link_created') and o.expires_at > now()) then
    raise exception 'This payment is still pending or under review. Check it before reordering.';
  end if;
  if exists (select 1 from public.payment_orders where cart_id = c.id and not is_test_checkout
    and (status = 'review_required' or (is_live_checkout and provider_claimed_at is not null and razorpay_order_id is null)
      or (status in ('creating_link','link_created') and expires_at > now()))) then
    raise exception 'Your cart has a pending payment. Resolve it before adding a reorder.';
  end if;
  for line in
    select i.*, p.published, p.minimum_order_quantity, p.show_price, p.price as product_price,
      v.price as variant_price, v.in_stock, v.available_quantity, v.id as current_variant
    from public.payment_order_items i left join public.products p on p.id = i.product_id
      left join public.product_variants v on v.id = i.variant_id and v.product_id = p.id
    where i.order_id = o.id order by i.variant_id
  loop
    reason := null;
    select * into current_item from public.cart_items where cart_id = c.id
      and product_id = line.product_id::text and variant_id = line.variant_id::text;
    requested := coalesce(current_item.quantity, 0) + greatest(line.quantity, coalesce(line.minimum_order_quantity, 1));
    select coalesce(sum(quantity), 0) into reserved from public.payment_order_items i
      join public.payment_orders pending on pending.id = i.order_id
      where i.variant_id = line.variant_id and pending.status in ('creating_link','link_created')
        and pending.expires_at > now() and not pending.is_test_checkout;
    if line.current_variant is null or not coalesce(line.published, false) then reason := 'No longer available';
    elsif not line.in_stock or requested > line.available_quantity - reserved then reason := 'Insufficient stock for the requested quantity';
    elsif not line.show_price or coalesce(line.variant_price, line.product_price, 0) <= 0 then reason := 'Current price requires confirmation';
    elsif requested > 99 then reason := 'Cart quantity limit reached';
    elsif current_item.id is null and (select count(*) from public.cart_items where cart_id = c.id) >= 50 then reason := 'Cart variant limit reached';
    end if;
    if reason is not null then
      skipped := skipped || jsonb_build_array(jsonb_build_object('productName',line.product_name,
        'variantName',line.variant_name,'reason',reason));
      continue;
    end if;
    insert into public.cart_items (cart_id, product_id, variant_id, product_name, variant_name, image_url, unit_price, quantity)
      values (c.id, line.product_id::text, line.variant_id::text, line.product_name, line.variant_name,
        line.image_url, coalesce(line.variant_price, line.product_price), requested)
      on conflict (cart_id, product_id, variant_id) do update set quantity = excluded.quantity;
    added := added + 1;
  end loop;
  if added > 0 then
    update public.carts set status = 'active', updated_at = now(), expires_at = now() + interval '30 days',
      whatsapp_started_at = null, delivery_estimate = null where id = c.id;
  end if;
  return jsonb_build_object('added',added,'skipped',skipped);
end;
$$;
revoke all on function public.reorder_customer_order(uuid,uuid) from public, anon;
grant execute on function public.reorder_customer_order(uuid,uuid) to authenticated;
