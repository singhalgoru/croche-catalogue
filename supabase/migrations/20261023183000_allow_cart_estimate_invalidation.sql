-- Cart contents can invalidate a rate without changing the verified destination.
-- Clearing an estimate is safe; only the verification service may supply one.
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
      or new.delivery_pin_lookup_at is distinct from old.delivery_pin_lookup_at then
      if new.delivery_pin_code is not null or new.delivery_pin_location is not null
        or new.delivery_pin_checked_at is not null or new.delivery_estimate is not null
        or new.delivery_pin_lookup_at is distinct from old.delivery_pin_lookup_at then
        raise exception 'Save delivery PIN codes through the verification service.';
      end if;
    elsif new.delivery_estimate is distinct from old.delivery_estimate
      and new.delivery_estimate is not null then
      raise exception 'Save delivery PIN codes through the verification service.';
    end if;
  end if;
  return new;
end;
$$;
