alter table public.product_variants
  add column if not exists available_quantity integer not null default 1;

update public.product_variants
set available_quantity = 0
where not in_stock;

alter table public.product_variants
  drop constraint if exists product_variants_available_quantity_check;

alter table public.product_variants
  add constraint product_variants_available_quantity_check
  check (
    available_quantity >= 0
    and (not in_stock or available_quantity > 0)
  );

delete from public.carts
where not exists (
  select 1
  from public.cart_items
  where cart_items.cart_id = carts.id
);

create or replace function public.record_variant_sale(
  target_variant_id uuid,
  sold_quantity integer
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
    raise exception 'Only catalogue admins can record sales.';
  end if;

  if sold_quantity < 1 then
    raise exception 'Sold quantity must be at least 1.';
  end if;

  update public.product_variants
  set
    available_quantity = available_quantity - sold_quantity,
    in_stock = in_stock and available_quantity - sold_quantity > 0,
    updated_at = now()
  where id = target_variant_id
    and available_quantity >= sold_quantity
  returning product_id into target_product_id;

  if target_product_id is null then
    raise exception 'Not enough inventory is available for this sale.';
  end if;

  update public.products
  set
    in_stock = exists (
      select 1
      from public.product_variants
      where product_id = target_product_id
        and in_stock
    ),
    updated_at = now()
  where id = target_product_id;
end;
$$;

revoke all on function public.record_variant_sale(uuid, integer) from public;
grant execute on function public.record_variant_sale(uuid, integer) to authenticated;
