-- Uses existing catalogue products; all ledger fixtures are rolled back.
begin;
create temporary table bestseller_candidates as
select p.id, row_number() over (order by p.id)::integer as position
from public.products p
where p.published and exists (
  select 1 from public.product_variants v
  where v.product_id = p.id and v.in_stock and v.available_quantity > 0
)
order by p.id limit 6;

do $$
begin
  if (select count(*) from bestseller_candidates) < 6 then
    raise exception 'This integration test requires six available published products.';
  end if;
end;
$$;

delete from public.seller_sales;
insert into public.seller_sales (product_id, product_name, sale_date, channel, quantity, unit_price)
select id, 'Bestseller test', current_date, 'offline',
  case position when 1 then 10 when 2 then 10 when 3 then 8 when 4 then 7 else 1 end, 100
from bestseller_candidates where position <= 4;
-- Same product, another variant: quantities must combine.
insert into public.seller_sales (product_id, product_name, variant_name, sale_date, channel, quantity, unit_price)
select id, 'Bestseller test', 'Second variant', current_date - 89, 'online', 2, 100
from bestseller_candidates where position = 3;
-- Old sales break ties but do not qualify a product on their own.
insert into public.seller_sales (product_id, product_name, sale_date, channel, quantity, unit_price)
select id, 'Bestseller test', current_date - 90, 'offline', 100, 100
from bestseller_candidates where position in (2, 5);
-- Future sales must never count.
insert into public.seller_sales (product_id, product_name, sale_date, channel, quantity, unit_price)
select id, 'Bestseller test', current_date + 1, 'offline', 1000, 100
from bestseller_candidates where position = 6;
-- Hidden or unavailable products must not enter the ranking.
insert into public.seller_sales (product_id, product_name, sale_date, channel, quantity, unit_price)
select p.id, 'Bestseller test', current_date, 'offline', 1000, 100
from public.products p
where not p.published or not exists (
  select 1 from public.product_variants v
  where v.product_id = p.id and v.in_stock and v.available_quantity > 0
);

set local role anon;
create temporary table bestseller_result as
select product_id, row_number() over ()::integer as position
from public.get_catalogue_bestsellers();
reset role;
do $$
declare
  expected uuid[];
  actual uuid[];
begin
  select array_agg(id order by array_position(array[2, 1, 3, 4], position))
    into expected from bestseller_candidates where position <= 4;
  select array_agg(product_id order by position) into actual from bestseller_result;
  if actual is distinct from expected then
    raise exception 'Bestseller ranking, cutoff, variant aggregation or availability failed.';
  end if;
end;
$$;
set local role anon;
do $$
begin
  if exists (select 1 from public.seller_sales) then
    raise exception 'Anonymous visitors can read private sales.';
  end if;
exception when insufficient_privilege then
  null;
end;
$$;
reset role;
rollback;
