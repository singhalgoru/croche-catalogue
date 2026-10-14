create or replace function public.guard_cart_item()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  owner_id uuid;
  source record;
  reserved bigint;
  available bigint;
begin
  if auth.role() = 'service_role' then return new; end if;
  select user_id into owner_id from public.carts where id = new.cart_id and expires_at > now() for update;
  if owner_id is null or owner_id is distinct from auth.uid() then
    raise exception 'Add products to your own active cart only.';
  end if;
  perform public.check_cart_write_limit(owner_id, 'write');
  if TG_OP = 'UPDATE' then
    if new.id is distinct from old.id or new.cart_id is distinct from old.cart_id
      or new.product_id is distinct from old.product_id or new.variant_id is distinct from old.variant_id
      or new.created_at is distinct from old.created_at then
      raise exception 'Cart item identity cannot be changed.';
    end if;
  end if;
  select p.name as product_name, p.public_slug, v.name as variant_name, v.image_url,
    v.id as variant_id, v.in_stock, v.available_quantity,
    case when p.show_price then coalesce(v.price, p.price) else null end as unit_price
  into source from public.products p join public.product_variants v on v.product_id = p.id
  where p.id::text = new.product_id and v.id::text = new.variant_id and p.published
  for update of p, v;
  if not found then
    raise exception 'This product or variant is no longer available. Refresh the catalogue.';
  end if;
  -- The cart's own checkout reservation already covers these units.
  select coalesce(sum(i.quantity), 0) into reserved
  from public.payment_order_items i join public.payment_orders o on o.id = i.order_id
  where i.variant_id = source.variant_id and not o.is_test_checkout
    and o.status in ('creating_link', 'link_created') and o.expires_at > now()
    and o.cart_id is distinct from new.cart_id;
  available := case when source.in_stock then greatest(0, source.available_quantity - reserved) else 0 end;
  if new.quantity > available then
    raise exception 'Only % available for %. Please reduce the quantity or remove this item.', available, source.variant_name;
  end if;
  if TG_OP = 'INSERT' then
    if not exists (select 1 from public.cart_items where cart_id = new.cart_id and product_id = new.product_id and variant_id = new.variant_id)
      and (select count(*) from public.cart_items where cart_id = new.cart_id) >= 50 then
      raise exception 'Your cart can contain up to 50 different variants.';
    end if;
    new.created_at := now();
  end if;
  new.product_name := source.product_name;
  new.product_public_slug := source.public_slug;
  new.variant_name := source.variant_name;
  new.image_url := source.image_url;
  new.unit_price := source.unit_price;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.guard_cart_item() from public, anon, authenticated;
