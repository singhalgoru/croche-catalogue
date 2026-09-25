create or replace function public.add_variant_stock(
  target_variant_id uuid,
  added_quantity integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_product_id uuid;
begin
  if not public.is_catalogue_admin() then
    raise exception 'Only catalogue admins can add stock.';
  end if;

  if added_quantity < 1 then
    raise exception 'Added quantity must be at least 1.';
  end if;

  update public.product_variants
  set
    available_quantity = available_quantity + added_quantity,
    in_stock = true,
    updated_at = now()
  where id = target_variant_id
  returning product_id into target_product_id;

  if target_product_id is null then
    raise exception 'The product variant no longer exists.';
  end if;

  update public.products
  set
    in_stock = true,
    updated_at = now()
  where id = target_product_id;
end;
$$;

revoke all on function public.add_variant_stock(uuid, integer) from public;
grant execute on function public.add_variant_stock(uuid, integer) to authenticated;
