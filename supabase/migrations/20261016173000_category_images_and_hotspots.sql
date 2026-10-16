alter table public.categories
  drop constraint seasonal_category_cover_image,
  add constraint category_cover_image check (
    cover_image_url = '' or
    cover_image_url ~ '^https://images[.]luviacreations[.]com/products/[a-zA-Z0-9_-]+/[a-zA-Z0-9_-]+[.]webp$'
  ),
  add column image_hotspots jsonb not null default '[]'::jsonb,
  add constraint category_hotspot_array check (
    jsonb_typeof(image_hotspots) = 'array' and jsonb_array_length(image_hotspots) <= 6
  );

create function public.validate_category_hotspots()
returns trigger language plpgsql set search_path = '' as $$
declare spot jsonb;
begin
  if tg_op = 'UPDATE' and new.cover_image_url is distinct from old.cover_image_url
    and new.image_hotspots = old.image_hotspots then
    new.image_hotspots := '[]'::jsonb;
  end if;
  if jsonb_typeof(new.image_hotspots) <> 'array' or jsonb_array_length(new.image_hotspots) > 6 then
    raise exception 'Use up to six product hotspots.';
  end if;
  if jsonb_array_length(new.image_hotspots) > 0 and new.cover_image_url = '' then
    raise exception 'Upload a category image before adding hotspots.';
  end if;
  for spot in select value from jsonb_array_elements(new.image_hotspots) loop
    if jsonb_typeof(spot) <> 'object' or jsonb_typeof(spot->'productId') is distinct from 'string'
      or jsonb_typeof(spot->'x') is distinct from 'number' or jsonb_typeof(spot->'y') is distinct from 'number' then
      raise exception 'Each hotspot needs a product and numeric coordinates.';
    end if;
    if (spot->>'x')::numeric not between 0 and 100 or (spot->>'y')::numeric not between 0 and 100 then
      raise exception 'Hotspot coordinates must be between 0 and 100.';
    end if;
    if not exists (
      select 1 from public.products p where p.id::text = spot->>'productId' and p.published
        and (not new.is_seasonal and p.category = new.name or new.is_seasonal and exists (
          select 1 from public.seasonal_category_products s where s.category_name = new.name and s.product_id = p.id))
    ) then raise exception 'Hotspots must link to published products in this category.'; end if;
  end loop;
  return new;
end;
$$;
revoke all on function public.validate_category_hotspots() from public, anon, authenticated;
create trigger validate_category_hotspots before insert or update of image_hotspots, cover_image_url
  on public.categories for each row execute function public.validate_category_hotspots();

create function public.save_category_content(
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
  update public.categories c set overview = btrim(category_overview), cover_image_url = category_cover_image,
    image_hotspots = category_hotspots,
    visible = case when category_row.is_seasonal then show_category else true end,
    featured_ticker = case when category_row.is_seasonal then feature_in_ticker and show_category else false end
  where c.name = category_name;
  return previous_cover;
end;
$$;
revoke all on function public.save_category_content(text,text,text,jsonb,uuid[],boolean,boolean) from public, anon;
grant execute on function public.save_category_content(text,text,text,jsonb,uuid[],boolean,boolean) to authenticated;
