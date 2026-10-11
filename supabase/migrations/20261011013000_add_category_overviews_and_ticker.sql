alter table public.categories
  add column overview text not null default '' check (char_length(overview) <= 2000),
  add column featured_ticker boolean not null default false,
  add constraint seasonal_ticker_only check (not featured_ticker or (is_seasonal and visible));
create unique index one_featured_seasonal_ticker on public.categories(featured_ticker) where featured_ticker;

drop function public.save_seasonal_category(text, uuid[], boolean);
create function public.save_seasonal_category(category_name text, selected_product_ids uuid[], show_category boolean,
  category_overview text default '', feature_in_ticker boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_catalogue_admin() then raise exception 'Catalogue administrator access is required.'; end if;
  perform pg_advisory_xact_lock(11013000);
  perform 1 from public.categories c where c.name = category_name and c.is_seasonal for update;
  if not found then raise exception 'Seasonal category was not found.'; end if;
  if selected_product_ids is null or show_category is null or category_overview is null or feature_in_ticker is null
    or char_length(category_overview) > 2000 then raise exception 'Valid products, visibility and overview are required.'; end if;
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
    featured_ticker = feature_in_ticker and show_category where c.name = category_name;
end;
$$;
revoke all on function public.save_seasonal_category(text, uuid[], boolean, text, boolean) from public;
grant execute on function public.save_seasonal_category(text, uuid[], boolean, text, boolean) to authenticated;
