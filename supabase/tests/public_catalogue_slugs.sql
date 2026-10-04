begin;

do $$
declare
  product_id uuid;
  variant_id uuid;
  product_name text;
  variant_name text;
  product_slug text;
  variant_slug text;
begin
  select p.id, v.id, p.name, v.name, p.public_slug, v.public_slug
  into product_id, variant_id, product_name, variant_name, product_slug, variant_slug
  from public.products p
  join public.product_variants v on v.product_id = p.id
  limit 1;
  if product_id is null then raise exception 'A product with a variant is required for this test.'; end if;

  update public.products
  set name = left(product_name, 70) || ' URL test ' || left(replace(product_id::text, '-', ''), 4)
  where id = product_id;
  update public.product_variants
  set name = left(variant_name, 40) || ' URL test ' || left(replace(variant_id::text, '-', ''), 4)
  where id = variant_id;

  if (select public_slug from public.products where id = product_id) <> product_slug then
    raise exception 'Product slug changed after a rename.';
  end if;
  if (select public_slug from public.product_variants where id = variant_id) <> variant_slug then
    raise exception 'Variant slug changed after a rename.';
  end if;
  if exists (
    select 1 from public.products group by public_slug having count(*) > 1
  ) then raise exception 'Duplicate product slugs exist.'; end if;
  if exists (
    select 1 from public.product_variants group by product_id, public_slug having count(*) > 1
  ) then raise exception 'Duplicate variant slugs exist within a product.'; end if;

  raise notice 'Public slugs remain stable after renames and are unique.';
end;
$$;

rollback;
