create function public.reduce_variant_stock(target_variant_id uuid, removed_quantity integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_product_id uuid;
  current_quantity integer;
  reserved bigint;
begin
  if not coalesce(public.is_catalogue_admin(), false) then
    raise exception 'Verified catalogue admin access is required to reduce stock.' using errcode = '42501';
  end if;
  if removed_quantity is null or removed_quantity < 1 then
    raise exception 'Stock reduction must be a whole number of at least 1.' using errcode = '22023';
  end if;

  select p.id into target_product_id
  from public.products p join public.product_variants v on v.product_id = p.id
  where v.id = target_variant_id for update of p;
  if not found then
    raise exception 'The product variant no longer exists.';
  end if;
  select available_quantity into current_quantity from public.product_variants
  where id = target_variant_id and product_id = target_product_id for update;
  if not found then
    raise exception 'The product variant no longer exists.';
  end if;
  if removed_quantity > current_quantity then
    raise exception 'Only % item(s) are available to reduce. Refresh the product and try again.', current_quantity;
  end if;
  select coalesce(sum(i.quantity), 0) into reserved
  from public.payment_order_items i join public.payment_orders o on o.id = i.order_id
  where i.variant_id = target_variant_id and not o.is_test_checkout
    and o.status in ('creating_link', 'link_created') and o.expires_at > now();
  if current_quantity - removed_quantity < reserved then
    raise exception '% item(s) are reserved for active payments. Stock cannot be reduced below this quantity.', reserved;
  end if;

  update public.product_variants
  set available_quantity = current_quantity - removed_quantity,
    in_stock = in_stock and current_quantity - removed_quantity > 0,
    updated_at = now()
  where id = target_variant_id;
  update public.products
  set in_stock = exists (
      select 1 from public.product_variants
      where product_id = target_product_id and in_stock and available_quantity > 0
    ), updated_at = now()
  where id = target_product_id;
end;
$$;
revoke all on function public.reduce_variant_stock(uuid, integer) from public, anon;
grant execute on function public.reduce_variant_stock(uuid, integer) to authenticated;
