-- Recover known child edit dates without labelling all products as edited today.
update public.products p
set updated_at = greatest(
  p.updated_at,
  (select max(v.updated_at) from public.product_variants v where v.product_id = p.id),
  (select max(i.created_at)
   from public.product_variant_images i
   join public.product_variants v on v.id = i.variant_id
   where v.product_id = p.id)
)
where p.updated_at < greatest(
  (select max(v.updated_at) from public.product_variants v where v.product_id = p.id),
  (select max(i.created_at)
   from public.product_variant_images i
   join public.product_variants v on v.id = i.variant_id
   where v.product_id = p.id)
);

create or replace function public.track_product_modification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) - 'updated_at') is distinct from (to_jsonb(old) - 'updated_at') then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger track_product_modification
before update on public.products
for each row execute function public.track_product_modification();

create or replace function public.track_product_child_modification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_product_id uuid;
  new_product_id uuid;
begin
  if tg_op = 'UPDATE' and new is not distinct from old then
    return null;
  end if;
  if tg_table_name = 'product_variants' then
    if tg_op <> 'INSERT' then old_product_id := old.product_id; end if;
    if tg_op <> 'DELETE' then new_product_id := new.product_id; end if;
  else
    if tg_op <> 'INSERT' then
      select product_id into old_product_id from public.product_variants where id = old.variant_id;
    end if;
    if tg_op <> 'DELETE' then
      select product_id into new_product_id from public.product_variants where id = new.variant_id;
    end if;
  end if;
  update public.products
  set updated_at = now()
  where id = old_product_id or id = new_product_id;
  return null;
end;
$$;

revoke all on function public.track_product_modification() from public, anon, authenticated;
revoke all on function public.track_product_child_modification() from public, anon, authenticated;

create trigger track_product_child_modification
after insert or update or delete on public.product_variants
for each row execute function public.track_product_child_modification();

create trigger track_product_child_modification
after insert or update or delete on public.product_variant_images
for each row execute function public.track_product_child_modification();
