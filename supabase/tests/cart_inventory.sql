begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
create temporary table inventory_fixture as
select gen_random_uuid() as owner_id, gen_random_uuid() as other_id,
  gen_random_uuid() as cart_id, gen_random_uuid() as other_cart_id,
  gen_random_uuid() as order_id, p.id as product_id, v.id as variant_id
from public.products p join public.product_variants v on v.product_id = p.id limit 1;
grant select on inventory_fixture to authenticated;
insert into auth.users(id) select owner_id from inventory_fixture union all select other_id from inventory_fixture;
insert into public.carts(id, user_id)
select cart_id, owner_id from inventory_fixture union all select other_cart_id, other_id from inventory_fixture;
update public.products set published = true where id = (select product_id from inventory_fixture);
update public.product_variants set in_stock = true, available_quantity = 3 where id = (select variant_id from inventory_fixture);
select set_config('request.jwt.claims', json_build_object('sub', (select owner_id from inventory_fixture), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare f record; item_id uuid; rejected boolean := false;
begin
  select * into f from inventory_fixture;
  begin
    insert into public.cart_items(cart_id, product_id, variant_id, product_name, variant_name, image_url, quantity)
    values(f.cart_id, f.product_id::text, f.variant_id::text, 'Untrusted', 'Untrusted', '', 4);
  exception when others then
    if SQLERRM not like 'Only 3 available%' then raise; end if;
    rejected := true;
  end;
  if not rejected then raise exception 'FAIL: overstock insert accepted.'; end if;
  insert into public.cart_items(cart_id, product_id, variant_id, product_name, variant_name, image_url, quantity)
  values(f.cart_id, f.product_id::text, f.variant_id::text, 'Untrusted', 'Untrusted', '', 3) returning id into item_id;
  rejected := false;
  begin update public.cart_items set quantity = 4 where id = item_id;
  exception when others then
    if SQLERRM not like 'Only 3 available%' then raise; end if;
    rejected := true;
  end;
  if not rejected then raise exception 'FAIL: overstock update accepted.'; end if;
  rejected := false;
  begin
    insert into public.cart_items(cart_id, product_id, variant_id, product_name, variant_name, image_url, quantity)
    values(f.cart_id, f.product_id::text, f.variant_id::text, 'Untrusted', 'Untrusted', '', 4)
    on conflict(cart_id, product_id, variant_id) do update set quantity = excluded.quantity;
  exception when others then
    if SQLERRM not like 'Only 3 available%' then raise; end if;
    rejected := true;
  end;
  if not rejected then raise exception 'FAIL: overstock upsert accepted.'; end if;
  if (select quantity from public.cart_items where id = item_id) <> 3 then raise exception 'FAIL: rejected update changed cart.'; end if;
  update public.cart_items set quantity = 1 where id = item_id;
end;
$$;
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
insert into public.payment_orders(id, reference, request_key, cart_id, created_by, customer_name, customer_contact,
  subtotal_paise, shipping_paise, total_paise, status, expires_at, razorpay_link_id, payment_url)
select order_id, 'LUV-' || order_id::text, gen_random_uuid(), other_cart_id, other_id, 'Inventory fixture', '+919876543210',
  100, 0, 100, 'link_created', now() + interval '10 minutes', 'plink_' || replace(order_id::text, '-', ''), 'https://example.invalid'
from inventory_fixture;
insert into public.payment_order_items(order_id, product_id, variant_id, product_name, variant_name, image_url, unit_price_paise, quantity)
select order_id, product_id, variant_id, 'Inventory fixture', 'Fixture', '', 100, 2 from inventory_fixture;
select set_config('request.jwt.claims', json_build_object('sub', (select owner_id from inventory_fixture), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare rejected boolean := false;
begin
  begin update public.cart_items set quantity = 2 where cart_id = (select cart_id from inventory_fixture);
  exception when others then
    if SQLERRM not like 'Only 1 available%' then raise; end if;
    rejected := true;
  end;
  if not rejected then raise exception 'FAIL: another cart reservation ignored.'; end if;
end;
$$;
reset role;
update public.payment_orders set cart_id = (select cart_id from inventory_fixture) where id = (select order_id from inventory_fixture);
set local role authenticated;
update public.cart_items set quantity = 3 where cart_id = (select cart_id from inventory_fixture);
reset role;
update public.payment_orders set cart_id = (select other_cart_id from inventory_fixture), expires_at = now() - interval '1 minute'
where id = (select order_id from inventory_fixture);
set local role authenticated;
update public.cart_items set quantity = 3 where cart_id = (select cart_id from inventory_fixture);
reset role;
update public.product_variants set in_stock = false where id = (select variant_id from inventory_fixture);
set local role authenticated;
do $$
declare rejected boolean := false;
begin
  begin update public.cart_items set quantity = 1 where cart_id = (select cart_id from inventory_fixture);
  exception when others then
    if SQLERRM not like 'Only 0 available%' then raise; end if;
    rejected := true;
  end;
  if not rejected then raise exception 'FAIL: out-of-stock variant accepted.'; end if;
  delete from public.cart_items where cart_id = (select cart_id from inventory_fixture);
end;
$$;
rollback;
