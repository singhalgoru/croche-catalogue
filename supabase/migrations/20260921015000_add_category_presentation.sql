alter table public.categories
add column if not exists is_featured boolean not null default false;

with first_category as (
  select name
  from public.categories
  order by sort_order, name
  limit 1
)
update public.categories
set is_featured = true
where name = (select name from first_category)
  and not exists (
    select 1
    from public.categories
    where is_featured
  );

create unique index if not exists categories_single_featured_idx
on public.categories (is_featured)
where is_featured;

create or replace function public.update_catalogue_category_presentation(
  category_name text,
  category_priority integer,
  featured boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_catalogue_admin() then
    raise exception 'Catalogue administrator access is required.';
  end if;

  if category_priority < 1 or category_priority > 999 then
    raise exception 'Category priority must be between 1 and 999.';
  end if;

  if not exists (
    select 1
    from public.categories
    where name = category_name
  ) then
    raise exception 'Category "%" was not found.', category_name;
  end if;

  if featured then
    update public.categories
    set is_featured = false
    where is_featured;
  end if;

  update public.categories
  set
    sort_order = category_priority,
    is_featured = case when featured then true else is_featured end
  where name = category_name;
end;
$$;

revoke all on function public.update_catalogue_category_presentation(text, integer, boolean)
from public;
grant execute on function public.update_catalogue_category_presentation(text, integer, boolean)
to authenticated;
