create table if not exists public.categories (
  name text primary key check (
    name = btrim(name)
    and char_length(name) between 2 and 50
  ),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

insert into public.categories (name, sort_order)
values
  ('Hair Accessories', 10),
  ('Rakhi', 20),
  ('Anklets', 30),
  ('Brooches', 40),
  ('Charms & Keychains', 50),
  ('Festive Decor', 60),
  ('Toys', 70)
on conflict (name) do nothing;

insert into public.categories (name, sort_order)
select distinct category, 100
from public.products
on conflict (name) do nothing;

alter table public.categories enable row level security;

create policy "Categories are publicly readable"
on public.categories
for select
using (true);

create policy "Admins can create categories"
on public.categories
for insert
to authenticated
with check (public.is_catalogue_admin());

create policy "Admins can update categories"
on public.categories
for update
to authenticated
using (public.is_catalogue_admin())
with check (public.is_catalogue_admin());

create policy "Admins can delete unused categories"
on public.categories
for delete
to authenticated
using (public.is_catalogue_admin());

alter table public.products
drop constraint if exists products_category_check;

alter table public.products
add constraint products_category_fkey
foreign key (category)
references public.categories(name)
on update cascade
on delete restrict;

create or replace function public.rename_catalogue_category(
  current_name text,
  replacement_name text
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

  replacement_name := btrim(replacement_name);
  if char_length(replacement_name) < 2 or char_length(replacement_name) > 50 then
    raise exception 'Category names must contain between 2 and 50 characters.';
  end if;

  update public.categories
  set name = replacement_name
  where name = current_name;

  if not found then
    raise exception 'Category "%" was not found.', current_name;
  end if;
end;
$$;

revoke all on function public.rename_catalogue_category(text, text) from public;
grant execute on function public.rename_catalogue_category(text, text) to authenticated;
