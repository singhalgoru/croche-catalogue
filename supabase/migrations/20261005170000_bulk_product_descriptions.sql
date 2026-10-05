create or replace function public.bulk_update_product_descriptions(changes jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved integer;
begin
  if not coalesce(public.is_catalogue_admin(), false) then
    raise exception 'Catalogue admin access is required.' using errcode = '42501';
  end if;
  if changes is null or jsonb_typeof(changes) <> 'array' then
    raise exception 'Description changes must be an array.' using errcode = '22023';
  end if;
  if jsonb_array_length(changes) = 0 or jsonb_array_length(changes) > 100 then
    raise exception 'Select between 1 and 100 products per batch.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(changes) c
    where jsonb_typeof(c->'id') is distinct from 'string'
      or jsonb_typeof(c->'description') is distinct from 'string'
      or length(btrim(c->>'description')) not between 1 and 2000
      or jsonb_typeof(c->'seoDescription') is distinct from 'string'
      or length(c->>'seoDescription') > 160
      or jsonb_typeof(c->'originalDescription') is distinct from 'string'
      or jsonb_typeof(c->'originalSeoDescription') is distinct from 'string'
  ) or (select count(distinct c->>'id') from jsonb_array_elements(changes) c) <> jsonb_array_length(changes) then
    raise exception 'Invalid or duplicate product description changes.' using errcode = '22023';
  end if;
  perform p.id from public.products p
    join jsonb_array_elements(changes) c on p.id = (c->>'id')::uuid
    order by p.id for update of p;
  if exists (
    select 1 from public.products p
    join jsonb_array_elements(changes) c on p.id = (c->>'id')::uuid
    where p.created_by is distinct from auth.uid()
  ) then
    raise exception 'You can only edit products belonging to your admin account.' using errcode = '42501';
  end if;
  if (select count(*) from public.products p
      join jsonb_array_elements(changes) c on p.id = (c->>'id')::uuid) <> jsonb_array_length(changes)
    or exists (
      select 1 from public.products p
      join jsonb_array_elements(changes) c on p.id = (c->>'id')::uuid
      where p.description is distinct from c->>'originalDescription'
        or coalesce(p.seo_description, '') is distinct from c->>'originalSeoDescription'
    ) then
    raise exception 'Products changed or were deleted after review. Refresh and generate again; no changes were saved.'
      using errcode = '40001';
  end if;
  update public.products p
  set description = btrim(c->>'description'),
      seo_description = nullif(btrim(c->>'seoDescription'), '')
  from jsonb_array_elements(changes) c
  where p.id = (c->>'id')::uuid;
  get diagnostics saved = row_count;
  return saved;
end;
$$;

revoke all on function public.bulk_update_product_descriptions(jsonb) from public;
grant execute on function public.bulk_update_product_descriptions(jsonb) to authenticated;
