begin;
do $$
declare
  admin_id uuid;
  product_id uuid;
  original_category text;
  seasonal_name text := 'Seasonal test ' || substr(gen_random_uuid()::text, 1, 8);
begin
  select user_id into strict admin_id from public.catalogue_admins limit 1;
  select id, category into strict product_id, original_category from public.products where published limit 1;
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  perform set_config('test.seasonal_name', seasonal_name, true);
  perform set_config('test.seasonal_product', product_id::text, true);
  insert into public.categories(name, is_seasonal) values (seasonal_name, true);
  perform public.save_seasonal_category(seasonal_name, array[product_id, product_id], true);
  perform public.save_seasonal_category(seasonal_name, array[product_id], true, 'Reviewed overview.', true);
  if not exists (select 1 from public.categories where name = seasonal_name and featured_ticker and overview = 'Reviewed overview.') then
    raise exception 'Overview and ticker were not persisted.';
  end if;
  insert into public.categories(name, is_seasonal) values (seasonal_name || ' next', true);
  perform public.save_seasonal_category(seasonal_name || ' next', array[product_id], true, '', true);
  if (select count(*) from public.categories where featured_ticker) <> 1
    or exists (select 1 from public.categories where name = seasonal_name and featured_ticker) then
    raise exception 'Featured ticker selection was not exclusive.';
  end if;
  perform public.save_seasonal_category(seasonal_name || ' next', array[product_id], false, '', true);
  if exists (select 1 from public.categories where name = seasonal_name || ' next' and featured_ticker) then
    raise exception 'Hidden seasonal ticker was not removed.';
  end if;
  if (select count(*) from public.seasonal_category_products s where s.category_name = seasonal_name) <> 1 then
    raise exception 'Duplicate memberships were not deduplicated.';
  end if;
  if (select category from public.products where id = product_id) <> original_category then
    raise exception 'Primary category was changed.';
  end if;
  begin
    update public.products set category = seasonal_name where id = product_id;
    raise exception 'Primary seasonal category should have been rejected.' using errcode = '23514';
  exception when raise_exception then
    if sqlerrm not like 'Choose a regular primary category%' then raise; end if;
  end;
end;
$$;
set local role anon;
do $$
begin
  if (select count(*) from public.seasonal_category_products where category_name = current_setting('test.seasonal_name')) <> 1 then
    raise exception 'Anonymous shoppers cannot read visible published membership.';
  end if;
end;
$$;
reset role;
select public.save_seasonal_category(current_setting('test.seasonal_name'), array[current_setting('test.seasonal_product')::uuid], false);
set local role anon;
do $$
begin
  if exists (select 1 from public.seasonal_category_products where category_name = current_setting('test.seasonal_name')) then
    raise exception 'Hidden membership is exposed to anonymous shoppers.';
  end if;
end;
$$;
reset role;
select set_config('request.jwt.claim.sub', '', true);
set local role authenticated;
do $$
begin
  begin
    perform public.save_seasonal_category(current_setting('test.seasonal_name'), array[]::uuid[], true);
    raise exception 'Non-admin save should have been rejected.' using errcode = '23514';
  exception when raise_exception then
    if sqlerrm <> 'Catalogue administrator access is required.' then raise; end if;
  end;
end;
$$;
reset role;
rollback;
