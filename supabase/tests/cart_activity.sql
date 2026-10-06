-- Run with: supabase db query --linked --file supabase/tests/cart_activity.sql
-- All fixture users, carts, rate counters and blocks are rolled back.
begin;
create temporary table cart_guard_fixture as
select gen_random_uuid() as owner_id, p.id as product_id, v.id as variant_id,
  p.name as product_name, p.public_slug, v.name as variant_name, v.image_url,
  case when p.show_price then coalesce(v.price, p.price) else null end as unit_price
from public.products p join public.product_variants v on v.product_id = p.id
where p.published limit 1;
do $$
begin
  if not exists (select 1 from cart_guard_fixture) then
    raise exception 'A published product/variant is required for cart guard tests.';
  end if;
end;
$$;
insert into auth.users (id) select owner_id from cart_guard_fixture;
grant select on cart_guard_fixture to authenticated;
select set_config('request.jwt.claims', json_build_object(
  'sub', (select owner_id from cart_guard_fixture), 'role', 'authenticated'
)::text, true);
set local role authenticated;

do $$
declare
  fixture record;
  fixture_cart_id uuid;
  item public.cart_items;
  rejected boolean;
begin
  select * into fixture from cart_guard_fixture;
  insert into public.carts (user_id, reference, created_at, expires_at)
  values (fixture.owner_id, 'FAKE-REFERENCE', now() - interval '1 year', now() + interval '1 year')
  returning id into fixture_cart_id;
  if exists (select 1 from public.carts where id = fixture_cart_id
    and (reference = 'FAKE-REFERENCE' or expires_at > now() + interval '31 days' or created_at < now() - interval '1 day')) then
    raise exception 'FAIL: cart identity/timestamps were not canonicalized.';
  end if;
  rejected := false;
  begin
    insert into public.cart_items (cart_id, product_id, variant_id, product_name, variant_name, image_url)
    values (fixture_cart_id, gen_random_uuid()::text, gen_random_uuid()::text, 'Fake', 'Fake', 'https://fake.invalid');
  exception when others then
    if SQLERRM not like '%no longer available%' then raise; end if;
    rejected := true;
  end;
  if not rejected then raise exception 'FAIL: nonexistent product accepted.'; end if;
  insert into public.cart_items (cart_id, product_id, variant_id, product_name, variant_name, image_url, unit_price)
  values (fixture_cart_id, fixture.product_id::text, fixture.variant_id::text, 'FAKE NAME', 'FAKE VARIANT', 'https://fake.invalid', 1)
  returning * into item;
  if item.product_name is distinct from fixture.product_name
    or item.variant_name is distinct from fixture.variant_name or item.image_url is distinct from fixture.image_url
    or item.unit_price is distinct from fixture.unit_price or item.product_public_slug is distinct from fixture.public_slug then
    raise exception 'FAIL: client-supplied item data was trusted.';
  end if;
  update public.cart_items set quantity = 2, product_name = 'FORGED' where id = item.id returning * into item;
  if item.quantity <> 2 or item.product_name <> fixture.product_name then
    raise exception 'FAIL: normal quantity update/canonicalization.';
  end if;
  insert into public.cart_items (cart_id, product_id, variant_id, product_name, variant_name, image_url, quantity, updated_at)
  values (fixture_cart_id, fixture.product_id::text, fixture.variant_id::text, 'FORGED UPSERT', 'FORGED', 'https://fake.invalid', 3, now())
  on conflict (cart_id, product_id, variant_id) do update set
    quantity = excluded.quantity, product_name = excluded.product_name, updated_at = excluded.updated_at
  returning * into item;
  if item.quantity <> 3 or item.product_name <> fixture.product_name then
    raise exception 'FAIL: existing-item upsert/canonicalization.';
  end if;
  rejected := false;
  begin
    update public.cart_items set variant_id = gen_random_uuid()::text where id = item.id;
  exception when others then
    if SQLERRM not like '%identity cannot be changed%' then raise; end if;
    rejected := true;
  end;
  if not rejected then raise exception 'FAIL: item identity tampering accepted.'; end if;
  rejected := false;
  begin
    update public.carts set reference = 'FORGED' where id = fixture_cart_id;
  exception when others then
    if SQLERRM not like '%identity cannot be changed%' then raise; end if;
    rejected := true;
  end;
  if not rejected then raise exception 'FAIL: cart identity tampering accepted.'; end if;
  rejected := false;
  begin
    insert into public.cart_session_blocks (user_id) values (fixture.owner_id);
  exception when insufficient_privilege then rejected := true;
  end;
  if not rejected then raise exception 'FAIL: shopper can manage session blocks.'; end if;
end;
$$;
reset role;
select set_config('request.jwt.claims', json_build_object(
  'sub', (select owner_id from cart_guard_fixture), 'role', 'service_role'
)::text, true);
delete from public.cart_items where cart_id in (select id from public.carts where user_id = (select owner_id from cart_guard_fixture));
insert into public.cart_items (cart_id, product_id, variant_id, product_name, variant_name, image_url)
select c.id, gen_random_uuid()::text, gen_random_uuid()::text, 'Temporary cap fixture', 'Test', ''
from public.carts c cross join generate_series(1, 50)
where c.user_id = (select owner_id from cart_guard_fixture);
select set_config('request.jwt.claims', json_build_object(
  'sub', (select owner_id from cart_guard_fixture), 'role', 'authenticated'
)::text, true);
set local role authenticated;
do $$
declare
  fixture record;
  rejected boolean := false;
begin
  select * into fixture from cart_guard_fixture;
  begin
    insert into public.cart_items (cart_id, product_id, variant_id, product_name, variant_name, image_url)
    select id, fixture.product_id::text, fixture.variant_id::text, 'Fake', 'Fake', ''
    from public.carts where user_id = auth.uid();
  exception when others then
    if SQLERRM not like '%up to 50 different variants%' then raise; end if;
    rejected := true;
  end;
  if not rejected then raise exception 'FAIL: 50-variant cart limit not enforced.'; end if;
end;
$$;
reset role;
update public.cart_write_limits set attempts = 59 where user_id = (select owner_id from cart_guard_fixture) and action = 'write';
set local role authenticated;
update public.carts set status = 'active' where user_id = auth.uid();
do $$
declare rejected boolean := false;
begin
  begin
    update public.carts set status = 'active' where user_id = auth.uid();
  exception when others then
    if SQLERRM not like '%Too many cart changes%' then raise; end if;
    rejected := true;
  end;
  if not rejected then raise exception 'FAIL: per-user rate limit not enforced.'; end if;
end;
$$;
reset role;
update public.cart_write_limits set window_started_at = now() - interval '2 minutes'
where user_id = (select owner_id from cart_guard_fixture) and action = 'write';
set local role authenticated;
update public.carts set status = 'whatsapp_started' where user_id = auth.uid();
reset role;
insert into public.catalogue_admins (user_id) select owner_id from cart_guard_fixture;
set local role authenticated;
insert into public.cart_session_blocks (user_id) select owner_id from cart_guard_fixture
on conflict (user_id) do nothing;
reset role;
delete from public.catalogue_admins where user_id = (select owner_id from cart_guard_fixture);
set local role authenticated;
do $$
declare rejected boolean := false;
begin
  begin
    update public.carts set status = 'active' where user_id = auth.uid();
  exception when others then
    if SQLERRM not like '%session has been blocked%' then raise; end if;
    rejected := true;
  end;
  if not rejected then raise exception 'FAIL: blocked session wrote to cart.'; end if;
  rejected := false;
  begin
    update public.cart_items set quantity = 4 where cart_id in (select id from public.carts where user_id = auth.uid());
  exception when others then
    if SQLERRM not like '%session has been blocked%' then raise; end if;
    rejected := true;
  end;
  if not rejected then raise exception 'FAIL: blocked session wrote to cart items.'; end if;
end;
$$;
reset role;
do $$
declare rejected boolean := false;
begin
  begin
    perform public.reserve_cart_pin_lookup(c.id, c.user_id) from public.carts c
    where c.user_id = (select owner_id from cart_guard_fixture);
  exception when others then
    if SQLERRM not like '%session has been blocked%' then raise; end if;
    rejected := true;
  end;
  if not rejected then raise exception 'FAIL: blocked session can look up PINs.'; end if;
end;
$$;
set local role authenticated;
delete from public.carts where user_id = auth.uid();
reset role;
insert into public.catalogue_admins (user_id) select owner_id from cart_guard_fixture;
set local role authenticated;
delete from public.cart_session_blocks where user_id = (select owner_id from cart_guard_fixture);
do $$
begin
  if exists (select 1 from public.cart_session_blocks where user_id = auth.uid()) then
    raise exception 'FAIL: admin cannot unblock a deleted cart session.';
  end if;
end;
$$;
reset role;
delete from public.catalogue_admins where user_id = (select owner_id from cart_guard_fixture);
update public.cart_write_limits set attempts = 10 where user_id = (select owner_id from cart_guard_fixture) and action = 'create';
set local role authenticated;
do $$
declare rejected boolean := false;
begin
  begin
    insert into public.carts (user_id) values (auth.uid());
  exception when others then
    if SQLERRM not like '%Too many cart changes%' then raise; end if;
    rejected := true;
  end;
  if not rejected then raise exception 'FAIL: repeated cart creation limit not enforced.'; end if;
end;
$$;
reset role;
rollback;
select 'PASS: canonical cart data, fake-product rejection, rate limits, session blocks, PIN blocks and deletion recovery' as result;
