alter table public.carts
  add column delivery_pin_location jsonb,
  add column delivery_pin_checked_at timestamptz,
  add column delivery_pin_lookup_at timestamptz;

create table public.delivery_pin_cache (
  pin text primary key check (pin ~ '^[1-9][0-9]{5}$'),
  location jsonb not null,
  checked_at timestamptz not null default now()
);
alter table public.delivery_pin_cache enable row level security;
revoke all on public.delivery_pin_cache from anon, authenticated;
grant all on public.delivery_pin_cache to service_role;

create function public.reserve_cart_pin_lookup(cart_id uuid, owner_id uuid)
returns boolean language sql security definer set search_path = public
as $$
  with reserved as (
    update public.carts
    set delivery_pin_lookup_at = now()
    where id = cart_id and user_id = owner_id and expires_at > now()
      and (delivery_pin_lookup_at is null or delivery_pin_lookup_at < now() - interval '10 seconds')
      and exists (select 1 from public.cart_items where cart_items.cart_id = carts.id)
    returning id
  ) select exists (select 1 from reserved);
$$;
revoke all on function public.reserve_cart_pin_lookup(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reserve_cart_pin_lookup(uuid, uuid) to service_role;

create function public.protect_verified_cart_pin()
returns trigger language plpgsql set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    if TG_OP = 'INSERT' then
      if new.delivery_pin_code is not null or new.delivery_pin_location is not null
        or new.delivery_pin_checked_at is not null or new.delivery_pin_lookup_at is not null then
        raise exception 'Save delivery PIN codes through the verification service.';
      end if;
    elsif new.delivery_pin_code is distinct from old.delivery_pin_code
      or new.delivery_pin_location is distinct from old.delivery_pin_location
      or new.delivery_pin_checked_at is distinct from old.delivery_pin_checked_at
      or new.delivery_pin_lookup_at is distinct from old.delivery_pin_lookup_at then
      if new.delivery_pin_code is not null or new.delivery_pin_location is not null
        or new.delivery_pin_checked_at is not null
        or new.delivery_pin_lookup_at is distinct from old.delivery_pin_lookup_at then
        raise exception 'Save delivery PIN codes through the verification service.';
      end if;
    end if;
  end if;
  return new;
end;
$$;
create trigger protect_verified_cart_pin before insert or update on public.carts
for each row execute function public.protect_verified_cart_pin();
