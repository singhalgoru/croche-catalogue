alter table public.categories
  add column is_seasonal boolean not null default false,
  add column visible boolean not null default true,
  add constraint regular_categories_visible check (is_seasonal or visible);

create table public.seasonal_category_products (
  category_name text not null references public.categories(name) on update cascade on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  primary key (category_name, product_id)
);
alter table public.seasonal_category_products enable row level security;
create policy "Read seasonal product membership"
  on public.seasonal_category_products for select using (
    exists (select 1 from public.categories c where c.name = category_name and c.visible and c.is_seasonal)
    and exists (select 1 from public.products p where p.id = product_id and p.published)
  );
create policy "Admins read all seasonal product membership"
  on public.seasonal_category_products for select to authenticated using (public.is_catalogue_admin());
grant select on public.seasonal_category_products to anon, authenticated;

create function public.save_seasonal_category(category_name text, selected_product_ids uuid[], show_category boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_catalogue_admin() then
    raise exception 'Catalogue administrator access is required.';
  end if;
  perform 1 from public.categories c where c.name = category_name and c.is_seasonal for update;
  if not found then raise exception 'Seasonal category was not found.'; end if;
  if selected_product_ids is null or show_category is null then
    raise exception 'Product selection and visibility are required.';
  end if;
  if exists (
    select 1 from unnest(selected_product_ids) selected(id)
    where not exists (select 1 from public.products p where p.id = selected.id)
  ) then raise exception 'One or more selected products no longer exist.'; end if;
  delete from public.seasonal_category_products s where s.category_name = save_seasonal_category.category_name;
  insert into public.seasonal_category_products(category_name, product_id)
    select save_seasonal_category.category_name, id from (select distinct unnest(selected_product_ids) id) selected;
  update public.categories c set visible = show_category where c.name = category_name;
end;
$$;
revoke all on function public.save_seasonal_category(text, uuid[], boolean) from public;
grant execute on function public.save_seasonal_category(text, uuid[], boolean) to authenticated;

create function public.check_primary_product_category()
returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.categories c where c.name = new.category and c.is_seasonal) then
    raise exception 'Choose a regular primary category; add this product to seasonal categories separately.';
  end if;
  return new;
end;
$$;
create trigger check_primary_product_category before insert or update of category on public.products
  for each row execute function public.check_primary_product_category();

create trigger request_site_rebuild after insert or update or delete on public.seasonal_category_products
  for each statement execute function public.request_site_rebuild();
