begin;

do $$
declare
  product_id uuid;
  variant_id uuid;
  gallery_id uuid;
  observed timestamptz;
  baseline constant timestamptz := '2000-01-01T00:00:00Z';
begin
  select v.product_id, v.id into product_id, variant_id
  from public.product_variants v
  join public.products p on p.id = v.product_id
  limit 1;
  if product_id is null then raise exception 'A product with a variant is required for this test.'; end if;

  update public.products set updated_at = baseline where id = product_id;
  update public.products set materials = 'Modification timestamp test.' where id = product_id;
  select updated_at into observed from public.products where id = product_id;
  if observed <> now() then raise exception 'Product edits did not update lastmod.'; end if;

  update public.products set updated_at = baseline where id = product_id;
  update public.product_variants set name = left(name, 40) || ' test' where id = variant_id;
  select updated_at into observed from public.products where id = product_id;
  if observed <> now() then raise exception 'Variant edits did not update lastmod.'; end if;

  update public.products set updated_at = baseline where id = product_id;
  insert into public.product_variant_images (variant_id, image_path, image_url)
  values (variant_id, 'timestamp-test/' || gen_random_uuid(), 'https://example.com/test.webp')
  returning id into gallery_id;
  select updated_at into observed from public.products where id = product_id;
  if observed <> now() then raise exception 'Gallery inserts did not update lastmod.'; end if;

  update public.products set updated_at = baseline where id = product_id;
  update public.product_variant_images set sort_order = 1 where id = gallery_id;
  select updated_at into observed from public.products where id = product_id;
  if observed <> now() then raise exception 'Gallery edits did not update lastmod.'; end if;

  update public.products set updated_at = baseline where id = product_id;
  delete from public.product_variant_images where id = gallery_id;
  select updated_at into observed from public.products where id = product_id;
  if observed <> now() then raise exception 'Gallery removals did not update lastmod.'; end if;

  update public.products set updated_at = baseline where id = product_id;
  delete from public.product_variants where id = variant_id;
  select updated_at into observed from public.products where id = product_id;
  if observed <> now() then raise exception 'Variant removals did not update lastmod.'; end if;
end;
$$;

rollback;
