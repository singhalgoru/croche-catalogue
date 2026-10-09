alter table public.carts
  add column delivery_estimate jsonb;

comment on column public.carts.delivery_estimate is
  'Approximate prepaid courier charge from Shiprocket for the saved delivery PIN; written only by the verify-delivery-pin function.';

-- Rates depend only on the destination PIN and billable weight, so cache them
-- briefly to keep repeat cart checks fast and Shiprocket calls low.
create table public.delivery_rate_cache (
  pin text not null check (pin ~ '^[1-9][0-9]{5}$'),
  weight_grams integer not null check (weight_grams between 1 and 100000),
  estimate jsonb,
  checked_at timestamptz not null default now(),
  primary key (pin, weight_grams)
);
alter table public.delivery_rate_cache enable row level security;
revoke all on public.delivery_rate_cache from anon, authenticated;
grant all on public.delivery_rate_cache to service_role;

-- Shiprocket API tokens last 10 days; keep one server-side so every lookup
-- does not need a fresh login.
create table public.shiprocket_auth_tokens (
  id smallint primary key default 1 check (id = 1),
  token text not null,
  expires_at timestamptz not null
);
alter table public.shiprocket_auth_tokens enable row level security;
revoke all on public.shiprocket_auth_tokens from anon, authenticated;
grant all on public.shiprocket_auth_tokens to service_role;

create or replace function public.protect_verified_cart_pin()
returns trigger language plpgsql set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    if TG_OP = 'INSERT' then
      if new.delivery_pin_code is not null or new.delivery_pin_location is not null
        or new.delivery_pin_checked_at is not null or new.delivery_pin_lookup_at is not null
        or new.delivery_estimate is not null then
        raise exception 'Save delivery PIN codes through the verification service.';
      end if;
    elsif new.delivery_pin_code is distinct from old.delivery_pin_code
      or new.delivery_pin_location is distinct from old.delivery_pin_location
      or new.delivery_pin_checked_at is distinct from old.delivery_pin_checked_at
      or new.delivery_pin_lookup_at is distinct from old.delivery_pin_lookup_at
      or new.delivery_estimate is distinct from old.delivery_estimate then
      if new.delivery_pin_code is not null or new.delivery_pin_location is not null
        or new.delivery_pin_checked_at is not null or new.delivery_estimate is not null
        or new.delivery_pin_lookup_at is distinct from old.delivery_pin_lookup_at then
        raise exception 'Save delivery PIN codes through the verification service.';
      end if;
    end if;
  end if;
  return new;
end;
$$;
