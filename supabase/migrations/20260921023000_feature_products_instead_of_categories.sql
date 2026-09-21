alter table public.products
add column if not exists featured boolean not null default false;

alter table public.products
add column if not exists published_at timestamptz;

update public.products
set published_at = created_at
where published and published_at is null;

create or replace function public.set_product_published_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.published and (tg_op = 'INSERT' or not old.published) then
    new.published_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists products_set_published_at on public.products;
create trigger products_set_published_at
before insert or update of published on public.products
for each row execute function public.set_product_published_at();

drop function if exists public.update_catalogue_category_presentation(text, integer, boolean);
drop index if exists public.categories_single_featured_idx;

alter table public.categories
drop column if exists is_featured;

create or replace function public.update_catalogue_category_priority(
  category_name text,
  category_priority integer
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

  update public.categories
  set sort_order = category_priority
  where name = category_name;

  if not found then
    raise exception 'Category "%" was not found.', category_name;
  end if;
end;
$$;

revoke all on function public.update_catalogue_category_priority(text, integer)
from public;
grant execute on function public.update_catalogue_category_priority(text, integer)
to authenticated;
