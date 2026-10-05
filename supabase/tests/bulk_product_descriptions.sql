-- Run against a catalogue with at least two products owned by an admin.
-- All writes and rebuild notifications are rolled back.
begin;
do $$
declare
  owner_id uuid;
  first_product public.products%rowtype;
  second_product public.products%rowtype;
  changes jsonb;
  result integer;
  rejected boolean;
begin
  select p.created_by into owner_id
  from public.products p join public.catalogue_admins a on a.user_id = p.created_by
  group by p.created_by having count(*) >= 2 limit 1;
  if owner_id is null then raise exception 'Test requires two products owned by an admin.'; end if;
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  select * into first_product from public.products where created_by = owner_id order by id limit 1;
  select * into second_product from public.products where created_by = owner_id and id <> first_product.id order by id limit 1;
  changes := jsonb_build_array(
    jsonb_build_object('id', first_product.id, 'description', 'Bulk test description one.',
      'seoDescription', 'Bulk test SEO one.', 'originalDescription', first_product.description,
      'originalSeoDescription', coalesce(first_product.seo_description, '')),
    jsonb_build_object('id', second_product.id, 'description', 'Bulk test description two.',
      'seoDescription', 'Bulk test SEO two.', 'originalDescription', second_product.description,
      'originalSeoDescription', coalesce(second_product.seo_description, ''))
  );
  -- Stale copy rejects the entire batch, including the valid first row.
  rejected := false;
  begin
    perform public.bulk_update_product_descriptions(
      jsonb_set(changes, '{1,originalDescription}', '"Stale description"'));
  exception when serialization_failure then rejected := true;
  end;
  if not rejected then raise exception 'Stale copy was accepted.'; end if;
  if (select description from public.products where id = first_product.id) is distinct from first_product.description then
    raise exception 'Partial save occurred after a conflict.';
  end if;
  -- Duplicate IDs and oversized summaries reject before writing.
  rejected := false;
  begin
    perform public.bulk_update_product_descriptions(jsonb_build_array(changes->0, changes->0));
  exception when invalid_parameter_value then rejected := true;
  end;
  if not rejected then raise exception 'Duplicate IDs were accepted.'; end if;
  rejected := false;
  begin
    perform public.bulk_update_product_descriptions(
      jsonb_set(changes, '{0,seoDescription}', to_jsonb(repeat('a', 161))));
  exception when invalid_parameter_value then rejected := true;
  end;
  if not rejected then raise exception 'Oversized summary was accepted.'; end if;
  result := public.bulk_update_product_descriptions(changes);
  if result <> 2 then raise exception 'Unexpected save count.'; end if;
  if exists (
    select 1 from public.products p where p.id in (first_product.id, second_product.id)
    and (to_jsonb(p) - array['description','seo_description','updated_at'])
      is distinct from (case when p.id = first_product.id then to_jsonb(first_product) else to_jsonb(second_product) end
        - array['description','seo_description','updated_at'])
  ) then raise exception 'Bulk save changed unrelated fields.'; end if;
  if (select description from public.products where id = first_product.id) <> 'Bulk test description one.'
    or (select seo_description from public.products where id = second_product.id) <> 'Bulk test SEO two.' then
    raise exception 'Descriptions were not saved.';
  end if;
  -- Non-admin calls cannot modify products, even with a valid payload.
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000000', true);
  rejected := false;
  begin
    perform public.bulk_update_product_descriptions(changes);
  exception when insufficient_privilege then rejected := true;
  end;
  if not rejected then raise exception 'Non-admin access was accepted.'; end if;
end;
$$;
rollback;
select 'Bulk description atomicity, validation, authorization and field isolation passed; all test writes rolled back.' as result;
