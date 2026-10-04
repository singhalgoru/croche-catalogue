create or replace function public.catalogue_url_slug(value text, fallback text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    nullif(trim(both '-' from regexp_replace(lower(btrim(value)), '[^a-z0-9]+', '-', 'g')), ''),
    fallback
  );
$$;

alter table public.products add column public_slug text;
alter table public.product_variants add column public_slug text;

do $$
declare
  item record;
  base_slug text;
  candidate_slug text;
  suffix integer;
begin
  for item in select id, name from public.products order by created_at, id loop
    base_slug := left(public.catalogue_url_slug(
      item.name,
      'product-' || left(replace(item.id::text, '-', ''), 8)
    ), 110);
    candidate_slug := base_slug;
    suffix := 2;
    while exists (select 1 from public.products p where p.public_slug = candidate_slug) loop
      candidate_slug := left(base_slug, 109 - length(suffix::text)) || '-' || suffix::text;
      suffix := suffix + 1;
    end loop;
    update public.products set public_slug = candidate_slug where id = item.id;
  end loop;

  for item in
    select id, product_id, name
    from public.product_variants
    order by product_id, created_at, id
  loop
    base_slug := left(public.catalogue_url_slug(
      item.name,
      'variant-' || left(replace(item.id::text, '-', ''), 8)
    ), 110);
    candidate_slug := base_slug;
    suffix := 2;
    while exists (
      select 1 from public.product_variants v
      where v.product_id = item.product_id and v.public_slug = candidate_slug
    ) loop
      candidate_slug := left(base_slug, 109 - length(suffix::text)) || '-' || suffix::text;
      suffix := suffix + 1;
    end loop;
    update public.product_variants set public_slug = candidate_slug where id = item.id;
  end loop;
end;
$$;

alter table public.products alter column public_slug set not null;
alter table public.product_variants alter column public_slug set not null;
alter table public.products add constraint products_public_slug_format
  check (public_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
alter table public.product_variants add constraint product_variants_public_slug_format
  check (public_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
create unique index products_public_slug_unique on public.products(public_slug);
create unique index product_variants_product_public_slug_unique
  on public.product_variants(product_id, public_slug);

create or replace function public.assign_product_public_slug()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_slug text;
  suffix integer := 2;
begin
  if tg_op = 'UPDATE' and old.public_slug is not null then
    new.public_slug := old.public_slug;
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(167984223, 1);
  base_slug := left(public.catalogue_url_slug(
    new.name,
    'product-' || left(replace(new.id::text, '-', ''), 8)
  ), 110);
  new.public_slug := base_slug;
  while exists (select 1 from public.products p where p.public_slug = new.public_slug and p.id <> new.id) loop
    new.public_slug := left(base_slug, 109 - length(suffix::text)) || '-' || suffix::text;
    suffix := suffix + 1;
  end loop;
  return new;
end;
$$;

create or replace function public.assign_variant_public_slug()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_slug text;
  suffix integer := 2;
begin
  if tg_op = 'UPDATE' and old.public_slug is not null then
    new.public_slug := old.public_slug;
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(167984223, 2);
  base_slug := left(public.catalogue_url_slug(
    new.name,
    'variant-' || left(replace(new.id::text, '-', ''), 8)
  ), 110);
  new.public_slug := base_slug;
  while exists (
    select 1 from public.product_variants v
    where v.product_id = new.product_id and v.public_slug = new.public_slug and v.id <> new.id
  ) loop
    new.public_slug := left(base_slug, 109 - length(suffix::text)) || '-' || suffix::text;
    suffix := suffix + 1;
  end loop;
  return new;
end;
$$;

revoke all on function public.catalogue_url_slug(text, text) from public, anon, authenticated;
revoke all on function public.assign_product_public_slug() from public, anon, authenticated;
revoke all on function public.assign_variant_public_slug() from public, anon, authenticated;

create trigger assign_product_public_slug
before insert or update on public.products
for each row execute function public.assign_product_public_slug();
create trigger assign_variant_public_slug
before insert or update on public.product_variants
for each row execute function public.assign_variant_public_slug();
