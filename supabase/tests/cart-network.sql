begin;
do $$
begin
  if not exists (select 1 from public.carts) then
    raise exception 'This integration test needs an existing cart.';
  end if;
end;
$$;
insert into public.cart_network_details (cart_id, ip_address, captured_at)
select id, '203.0.113.9', now() from public.carts limit 1
on conflict (cart_id) do update set ip_address = excluded.ip_address, captured_at = excluded.captured_at;

set local role anon;
do $$
begin
  perform 1 from public.cart_network_details;
  raise exception 'Anonymous table read must be denied.';
exception when insufficient_privilege then
  null;
end;
$$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
do $$
begin
  if exists (select 1 from public.cart_network_details) then
    raise exception 'Ordinary shoppers must not read network records.';
  end if;
  begin
    delete from public.cart_network_details;
    raise exception 'Ordinary shoppers must not modify network records.';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;
reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', (select user_id from public.catalogue_admins limit 1), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  if not exists (select 1 from public.cart_network_details where ip_address = '203.0.113.9') then
    raise exception 'Admins must be able to read recent network records.';
  end if;
end;
$$;
reset role;
update public.cart_network_details set captured_at = now() - interval '31 days';
set local role authenticated;
do $$
begin
  if exists (select 1 from public.cart_network_details) then
    raise exception 'Even admins must not read expired network records.';
  end if;
end;
$$;
reset role;
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'purge-expired-cart-network-details' and active) then
    raise exception 'The network retention cleanup job must be active.';
  end if;
end;
$$;
rollback;
