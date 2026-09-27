alter table public.products
add column sort_order integer not null default 0;

with ordered_products as (
  select
    product.id,
    row_number() over (
      order by
        product.published desc,
        product.featured desc,
        (
          product.published_at >= now() - interval '3 days'
          and product.published_at <= now()
        ) desc,
        coalesce(category.sort_order, 2147483647),
        product.created_at,
        product.id
    ) - 1 as position
  from public.products as product
  left join public.categories as category on category.name = product.category
)
update public.products
set sort_order = ordered_products.position
from ordered_products
where products.id = ordered_products.id;

create or replace function public.reorder_catalogue_products(ordered_product_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.is_catalogue_admin(), false) then
    raise exception 'Catalogue admin access is required.'
      using errcode = '42501';
  end if;

  if ordered_product_ids is null then
    raise exception 'Product ordering must include every product exactly once.'
      using errcode = '22023';
  end if;

  if cardinality(ordered_product_ids) <> (select count(*) from public.products)
    or cardinality(ordered_product_ids) <> (
      select count(distinct product_id)
      from unnest(ordered_product_ids) as requested(product_id)
    )
    or exists (
      select 1
      from unnest(ordered_product_ids) as requested(product_id)
      left join public.products on products.id = requested.product_id
      where products.id is null
    )
  then
    raise exception 'Product ordering must include every product exactly once.'
      using errcode = '22023';
  end if;

  update public.products
  set sort_order = requested.position - 1
  from unnest(ordered_product_ids) with ordinality as requested(product_id, position)
  where products.id = requested.product_id;
end;
$$;

revoke all on function public.reorder_catalogue_products(uuid[]) from public;
grant execute on function public.reorder_catalogue_products(uuid[]) to authenticated;
