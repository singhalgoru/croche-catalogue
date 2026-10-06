create table public.cart_session_blocks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.cart_session_blocks enable row level security;
revoke all on public.cart_session_blocks from anon;
create policy "Admins can manage blocked cart sessions"
on public.cart_session_blocks for all to authenticated
using (public.is_catalogue_admin()) with check (public.is_catalogue_admin());
grant select, insert, delete on public.cart_session_blocks to authenticated;
revoke update on public.cart_session_blocks from authenticated;

create table public.cart_write_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('write', 'create')),
  window_started_at timestamptz not null default now(),
  attempts integer not null default 1,
  primary key (user_id, action)
);
alter table public.cart_write_limits enable row level security;
revoke all on public.cart_write_limits from anon, authenticated;
grant all on public.cart_write_limits to service_role;

create function public.check_cart_write_limit(owner_id uuid, action_name text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  current_attempts integer;
  window_length interval := case when action_name = 'create' then interval '1 hour' else interval '1 minute' end;
  maximum_attempts integer := case when action_name = 'create' then 10 else 60 end;
begin
  if exists (select 1 from public.cart_session_blocks where user_id = owner_id) then
    raise exception 'This cart session has been blocked. Please contact Luvia if you think this is a mistake.';
  end if;
  insert into public.cart_write_limits as limits (user_id, action)
  values (owner_id, action_name)
  on conflict (user_id, action) do update set
    attempts = case when limits.window_started_at <= now() - window_length then 1 else limits.attempts + 1 end,
    window_started_at = case when limits.window_started_at <= now() - window_length then now() else limits.window_started_at end
  returning attempts into current_attempts;
  if current_attempts > maximum_attempts then
    raise exception 'Too many cart changes. Please wait % before trying again.',
      case when action_name = 'create' then 'an hour' else 'a minute' end;
  end if;
end;
$$;
revoke all on function public.check_cart_write_limit(uuid, text) from public, anon, authenticated;

create function public.guard_cart_activity()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if auth.role() = 'service_role' then return new; end if;
  if new.user_id is distinct from auth.uid() then
    raise exception 'You can only change your own cart.';
  end if;
  perform public.check_cart_write_limit(new.user_id, 'write');
  if TG_OP = 'INSERT' then
    perform public.check_cart_write_limit(new.user_id, 'create');
    new.created_at := now();
    new.reference := 'CRT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    new.status := 'active';
    new.whatsapp_started_at := null;
  else
    if new.id is distinct from old.id or new.user_id is distinct from old.user_id
      or new.reference is distinct from old.reference or new.created_at is distinct from old.created_at then
      raise exception 'Cart identity cannot be changed.';
    end if;
    if new.status = 'whatsapp_started' then
      if not exists (select 1 from public.cart_items where cart_id = new.id) then
        raise exception 'Add a product before starting a cart enquiry.';
      end if;
      new.whatsapp_started_at := case when old.status = 'whatsapp_started' then old.whatsapp_started_at else now() end;
    else
      new.whatsapp_started_at := null;
    end if;
  end if;
  new.updated_at := now();
  new.expires_at := now() + interval '30 days';
  return new;
end;
$$;
create trigger guard_cart_activity before insert or update on public.carts
for each row execute function public.guard_cart_activity();
revoke all on function public.guard_cart_activity() from public, anon, authenticated;

create function public.guard_cart_item()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  owner_id uuid;
  source record;
begin
  if auth.role() = 'service_role' then return new; end if;
  select user_id into owner_id from public.carts where id = new.cart_id and expires_at > now() for update;
  if owner_id is null or owner_id is distinct from auth.uid() then
    raise exception 'Add products to your own active cart only.';
  end if;
  perform public.check_cart_write_limit(owner_id, 'write');
  if TG_OP = 'UPDATE' then
    if new.id is distinct from old.id or new.cart_id is distinct from old.cart_id
      or new.product_id is distinct from old.product_id or new.variant_id is distinct from old.variant_id
      or new.created_at is distinct from old.created_at then
      raise exception 'Cart item identity cannot be changed.';
    end if;
  end if;
  select p.name as product_name, p.public_slug, v.name as variant_name, v.image_url,
    case when p.show_price then coalesce(v.price, p.price) else null end as unit_price
  into source from public.products p join public.product_variants v on v.product_id = p.id
  where p.id::text = new.product_id and v.id::text = new.variant_id and p.published;
  if not found then
    raise exception 'This product or variant is no longer available. Refresh the catalogue.';
  end if;
  if TG_OP = 'INSERT' then
    if not exists (select 1 from public.cart_items where cart_id = new.cart_id and product_id = new.product_id and variant_id = new.variant_id)
      and (select count(*) from public.cart_items where cart_id = new.cart_id) >= 50 then
      raise exception 'Your cart can contain up to 50 different variants.';
    end if;
    new.created_at := now();
  end if;
  new.product_name := source.product_name;
  new.product_public_slug := source.public_slug;
  new.variant_name := source.variant_name;
  new.image_url := source.image_url;
  new.unit_price := source.unit_price;
  new.updated_at := now();
  return new;
end;
$$;
create trigger guard_cart_item before insert or update on public.cart_items
for each row execute function public.guard_cart_item();
revoke all on function public.guard_cart_item() from public, anon, authenticated;

create or replace function public.reserve_cart_pin_lookup(cart_id uuid, owner_id uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  reserved boolean;
begin
  if exists (select 1 from public.cart_session_blocks where user_id = owner_id) then
    raise exception 'This cart session has been blocked.';
  end if;
    with reserved_cart as (
      update public.carts
      set delivery_pin_lookup_at = now()
      where id = cart_id and user_id = owner_id and expires_at > now()
        and (delivery_pin_lookup_at is null or delivery_pin_lookup_at < now() - interval '10 seconds')
        and exists (select 1 from public.cart_items where cart_items.cart_id = carts.id)
      returning id
    ) select exists (select 1 from reserved_cart) into reserved;
  return reserved;
end;
$$;
