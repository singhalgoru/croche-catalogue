begin;
do $$
declare admin_id uuid; regular_name text := 'Visibility ' || substr(gen_random_uuid()::text, 1, 8);
  seasonal_name text := regular_name || ' seasonal';
begin
  select user_id into strict admin_id from public.catalogue_admins limit 1;
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  perform set_config('test.visibility_regular', regular_name, true);
  insert into public.categories(name, is_seasonal) values (regular_name, false), (seasonal_name, true);
  perform public.set_category_visibility(regular_name, false);
  if (select visible from public.categories where name = regular_name) then
    raise exception 'Regular category was not hidden.';
  end if;
  perform public.save_category_content(regular_name, 'Overview', '', '[]'::jsonb);
  if (select visible from public.categories where name = regular_name) then
    raise exception 'Editing content made a hidden category visible.';
  end if;
  perform public.set_category_visibility(regular_name, true);
  if not (select visible from public.categories where name = regular_name) then
    raise exception 'Regular category was not restored.';
  end if;
  update public.categories set featured_ticker = false where featured_ticker;
  update public.categories set featured_ticker = true where name = seasonal_name;
  perform public.set_category_visibility(seasonal_name, false);
  if exists (select 1 from public.categories where name = seasonal_name and (visible or featured_ticker)) then
    raise exception 'Hidden seasonal ticker was not cleared.';
  end if;
end;
$$;
select set_config('request.jwt.claim.sub', '', true);
set local role authenticated;
do $$
begin
  begin
    perform public.set_category_visibility(current_setting('test.visibility_regular'), false);
    raise exception 'Non-admin visibility change should fail.' using errcode = '23514';
  exception when raise_exception then
    if sqlerrm <> 'Catalogue administrator access is required.' then raise; end if;
  end;
end;
$$;
reset role;
rollback;
