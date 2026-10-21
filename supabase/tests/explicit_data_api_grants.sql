begin;
do $$
declare
  table_name text;
  privilege_name text;
begin
  foreach table_name in array array[
    'products', 'categories', 'product_variants',
    'product_variant_images', 'ticker_messages'
  ] loop
    if not has_table_privilege('anon', 'public.' || table_name, 'select') then
      raise exception 'Anonymous SELECT is missing on public.%', table_name;
    end if;
  end loop;

  foreach table_name in array array[
    'products', 'categories', 'product_variants', 'product_variant_images',
    'ticker_messages', 'carts', 'cart_items', 'seller_sales',
    'business_expenses', 'product_drafts'
  ] loop
    foreach privilege_name in array array['select', 'insert', 'update', 'delete'] loop
      if not has_table_privilege(
        'authenticated', 'public.' || table_name, privilege_name
      ) then
        raise exception 'Authenticated % is missing on public.%', privilege_name, table_name;
      end if;
      if not has_table_privilege(
        'service_role', 'public.' || table_name, privilege_name
      ) then
        raise exception 'Service-role % is missing on public.%', privilege_name, table_name;
      end if;
    end loop;
  end loop;

  if not has_table_privilege(
    'authenticated', 'public.catalogue_admins', 'select'
  ) then
    raise exception 'Authenticated SELECT is missing on public.catalogue_admins';
  end if;
  foreach privilege_name in array array['select', 'insert', 'update', 'delete'] loop
    if not has_table_privilege(
      'service_role', 'public.catalogue_admins', privilege_name
    ) then
      raise exception 'Service-role % is missing on public.catalogue_admins', privilege_name;
    end if;
  end loop;
  if has_table_privilege('anon', 'public.product_drafts', 'select') then
    raise exception 'Anonymous users must not read product drafts';
  end if;
end;
$$;
rollback;
