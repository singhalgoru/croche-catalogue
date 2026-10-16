create or replace function public.save_category_content(
  category_name text, category_overview text, category_cover_image text, category_hotspots jsonb,
  selected_product_ids uuid[] default null, show_category boolean default true, feature_in_ticker boolean default false
)
returns text language plpgsql security definer set search_path = '' as $$
declare category_row public.categories; previous_cover text;
begin
  if not public.is_catalogue_admin() then raise exception 'Catalogue administrator access is required.'; end if;
  perform pg_advisory_xact_lock(11013000);
  select * into category_row from public.categories c where c.name = category_name for update;
  if not found then raise exception 'Category was not found.'; end if;
  previous_cover := category_row.cover_image_url;
  if category_overview is null or char_length(category_overview) > 2000
    or cardinality(regexp_split_to_array(btrim(category_overview), '\s+')) > 90
    or category_cover_image is null or category_hotspots is null
    or show_category is null or feature_in_ticker is null then
    raise exception 'Valid category content and an overview of up to 90 words are required.';
  end if;
  if category_cover_image = '' and category_hotspots <> '[]'::jsonb then
    raise exception 'Upload a category image before adding hotspots.';
  end if;
  if category_row.is_seasonal then
    if selected_product_ids is null then raise exception 'Seasonal product selection is required.'; end if;
    if exists(select 1 from unnest(selected_product_ids) selected(id)
      where not exists(select 1 from public.products p where p.id = selected.id)) then
      raise exception 'One or more selected products no longer exist.';
    end if;
    delete from public.seasonal_category_products s where s.category_name = save_category_content.category_name;
    insert into public.seasonal_category_products(category_name, product_id)
      select save_category_content.category_name, id from (select distinct unnest(selected_product_ids) id) selected;
    if feature_in_ticker and show_category then
      update public.categories set featured_ticker = false where featured_ticker;
    end if;
  end if;
  -- Invalidate old positions first; newly authored markers may have identical coordinates.
  if category_cover_image is distinct from previous_cover and category_row.image_hotspots <> '[]'::jsonb then
    update public.categories c set image_hotspots = '[]'::jsonb where c.name = category_name;
  end if;
  update public.categories c set overview = btrim(category_overview), cover_image_url = category_cover_image,
    image_hotspots = category_hotspots,
    visible = case when category_row.is_seasonal then show_category else true end,
    featured_ticker = case when category_row.is_seasonal then feature_in_ticker and show_category else false end
  where c.name = category_name;
  return previous_cover;
end;
$$;
