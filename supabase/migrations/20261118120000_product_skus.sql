create sequence public.product_sku_sequence;
alter table public.products add column sku text unique
  check (sku ~ '^LUV-[0-9]{6,}$');
alter sequence public.product_sku_sequence owned by public.products.sku;
revoke all on sequence public.product_sku_sequence from public,anon,authenticated;

create function public.assign_product_sku()
returns trigger language plpgsql security definer set search_path=''
as $$
declare number text;
begin
  if tg_op='UPDATE' then
    if new.sku is distinct from old.sku then
      raise exception 'Product SKU is assigned automatically and cannot be changed.';
    end if;
    return new;
  end if;
  if new.sku is not null then
    raise exception 'Do not supply a SKU; it is assigned automatically when creating a product.';
  end if;
  number:=nextval('public.product_sku_sequence'::regclass)::text;
  new.sku:='LUV-'||lpad(number,greatest(6,length(number)),'0');
  return new;
end $$;
revoke all on function public.assign_product_sku() from public,anon,authenticated;
create trigger assign_product_sku before insert or update of sku on public.products
for each row execute function public.assign_product_sku();
