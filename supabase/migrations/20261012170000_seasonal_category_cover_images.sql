alter table public.categories
  add column cover_image_url text not null default '',
  add constraint seasonal_category_cover_image check (
    cover_image_url = '' or (is_seasonal and
      cover_image_url ~ '^https://images[.]luviacreations[.]com/products/[a-zA-Z0-9_-]+/[a-zA-Z0-9_-]+[.]webp$')
  );

drop function public.save_seasonal_category(text, uuid[], boolean, text, boolean);
create function public.save_seasonal_category(category_name text, selected_product_ids uuid[], show_category boolean,
  category_overview text default '', feature_in_ticker boolean default false, category_cover_image text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare previous_cover text;
begin
  if not public.is_catalogue_admin() then raise exception 'Catalogue administrator access is required.'; end if;
  perform pg_advisory_xact_lock(11013000);
  select c.cover_image_url into previous_cover from public.categories c where c.name = category_name and c.is_seasonal for update;
  if not found then raise exception 'Seasonal category was not found.'; end if;
  if selected_product_ids is null or show_category is null or category_overview is null or feature_in_ticker is null
    or char_length(category_overview) > 2000 then raise exception 'Valid products, visibility and overview are required.'; end if;
  if category_cover_image is not null and category_cover_image <> '' and
    category_cover_image !~ '^https://images[.]luviacreations[.]com/products/[a-zA-Z0-9_-]+/[a-zA-Z0-9_-]+[.]webp$'
    then raise exception 'A valid seasonal cover image URL is required.'; end if;
  if exists (select 1 from unnest(selected_product_ids) selected(id)
    where not exists (select 1 from public.products p where p.id = selected.id))
    then raise exception 'One or more selected products no longer exist.'; end if;
  delete from public.seasonal_category_products s where s.category_name = save_seasonal_category.category_name;
  insert into public.seasonal_category_products(category_name, product_id)
    select save_seasonal_category.category_name, id from (select distinct unnest(selected_product_ids) id) selected;
  if feature_in_ticker and show_category then
    update public.categories set featured_ticker = false where featured_ticker;
  end if;
  update public.categories c set visible = show_category, overview = btrim(category_overview),
    featured_ticker = feature_in_ticker and show_category,
    cover_image_url = coalesce(category_cover_image, c.cover_image_url) where c.name = category_name;
  return previous_cover;
end;
$$;
revoke all on function public.save_seasonal_category(text, uuid[], boolean, text, boolean, text) from public;
grant execute on function public.save_seasonal_category(text, uuid[], boolean, text, boolean, text) to authenticated;
