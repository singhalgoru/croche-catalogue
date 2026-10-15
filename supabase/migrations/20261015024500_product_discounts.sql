alter table public.products
  add column discount_percent integer not null default 0 check (discount_percent between 0 and 90),
  add column regular_price integer check (regular_price > 0);
alter table public.product_variants
  add column regular_price integer check (regular_price > 0);

create function public.guard_discount_price_edit()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare percent integer;
begin
  if tg_table_name = 'products' then
    if old.discount_percent > 0 and new.discount_percent = old.discount_percent
      and (new.price is distinct from old.price or new.regular_price is distinct from old.regular_price) then
      raise exception 'Remove the product discount before changing its regular price.';
    end if;
  else
    if tg_op = 'INSERT' then
      select discount_percent into percent from public.products where id = new.product_id for share;
      if percent > 0 and new.price is not null then
        new.regular_price := new.price;
        new.price := greatest(1, round(new.price::numeric * (100 - percent) / 100)::integer);
      end if;
    else
      select discount_percent into percent from public.products where id = new.product_id;
      if percent > 0 and (new.price is distinct from old.price or new.regular_price is distinct from old.regular_price) then
        raise exception 'Remove the product discount before changing variant prices.';
      end if;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_discount_price_edit() from public, anon, authenticated;
create trigger guard_product_discount_price before update on public.products
for each row execute function public.guard_discount_price_edit();
create trigger guard_variant_discount_price before insert or update on public.product_variants
for each row execute function public.guard_discount_price_edit();

create function public.set_product_discount(target_product_id uuid, percent_off integer)
returns void language plpgsql security definer set search_path = ''
as $$
declare target public.products%rowtype;
begin
  if not coalesce(public.is_catalogue_admin(), false) then
    raise exception 'Verified catalogue admin access is required.' using errcode = '42501';
  end if;
  if percent_off is null or percent_off not between 0 and 90 then
    raise exception 'Choose a whole percentage from 1 to 90, or 0 to remove the discount.' using errcode = '22023';
  end if;
  select * into target from public.products where id = target_product_id for update;
  if not found then raise exception 'The product no longer exists.'; end if;
  perform id from public.product_variants where product_id = target_product_id order by id for update;
  if percent_off > 0 and (not target.show_price or coalesce(target.regular_price, target.price, 0) < 1) then
    raise exception 'Set a public product price before running a discount.';
  end if;
  if percent_off > 0 and exists (
    select 1 from public.product_variants
    where product_id = target_product_id and coalesce(regular_price, price) <= 0
  ) then
    raise exception 'Set positive variant prices before running a discount.';
  end if;

  -- Restore the regular prices first, so changing an offer never compounds discounts.
  update public.products set discount_percent = 0, price = coalesce(regular_price, price),
    regular_price = null, updated_at = now() where id = target_product_id;
  update public.product_variants set price = coalesce(regular_price, price),
    regular_price = null, updated_at = now() where product_id = target_product_id;
  if percent_off > 0 then
    update public.product_variants
    set regular_price = price,
      price = greatest(1, round(price::numeric * (100 - percent_off) / 100)::integer),
      updated_at = now()
    where product_id = target_product_id and price is not null;
    update public.products
    set regular_price = price,
      price = greatest(1, round(price::numeric * (100 - percent_off) / 100)::integer),
      discount_percent = percent_off, updated_at = now()
    where id = target_product_id;
  end if;
end;
$$;
revoke all on function public.set_product_discount(uuid, integer) from public, anon;
grant execute on function public.set_product_discount(uuid, integer) to authenticated;
