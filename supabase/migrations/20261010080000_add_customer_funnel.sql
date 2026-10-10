create table public.cart_delivery_details (
  cart_id uuid primary key references public.carts(id) on delete cascade,
  details jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.cart_delivery_details enable row level security;
revoke all on public.cart_delivery_details from anon, authenticated;
grant select on public.cart_delivery_details to authenticated;
grant all on public.cart_delivery_details to service_role;
create policy "Owners and admins can read active delivery details"
on public.cart_delivery_details for select to authenticated
using (exists (select 1 from public.carts c where c.id = cart_id and c.expires_at > now()
  and (c.user_id = auth.uid() or public.is_catalogue_admin())));

create function public.save_cart_delivery_details(target_cart_id uuid, delivery jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare owner_id uuid := auth.uid(); cleaned jsonb;
begin
  if owner_id is null then raise exception 'Sign in to your cart session first.'; end if;
  if not exists (select 1 from public.carts where id = target_cart_id and user_id = owner_id
    and expires_at > now()) then raise exception 'An active owned cart is required.'; end if;
  if not exists (select 1 from public.cart_items where cart_id = target_cart_id) then
    raise exception 'Add products before saving delivery details.';
  end if;
  perform public.check_cart_write_limit(owner_id, 'write');
  if delivery is null or jsonb_typeof(delivery) <> 'object' or octet_length(delivery::text) > 8192 then
    raise exception 'Invalid delivery details.';
  end if;
  cleaned := jsonb_build_object(
    'name', btrim(delivery->>'name'), 'phone', btrim(delivery->>'phone'),
    'email', lower(btrim(coalesce(delivery->>'email', ''))),
    'addressLine1', btrim(delivery->>'addressLine1'),
    'addressLine2', btrim(coalesce(delivery->>'addressLine2', '')),
    'city', btrim(delivery->>'city'), 'state', btrim(delivery->>'state'),
    'pincode', btrim(delivery->>'pincode'));
  if coalesce(char_length(cleaned->>'name'),0) not between 1 and 80
    or coalesce(cleaned->>'phone','') !~ '^[6-9][0-9]{9}$'
    or coalesce(char_length(cleaned->>'addressLine1'),0) not between 5 and 200
    or char_length(cleaned->>'addressLine2') > 200
    or coalesce(char_length(cleaned->>'city'),0) not between 1 and 80
    or coalesce(char_length(cleaned->>'state'),0) not between 1 and 80
    or coalesce(cleaned->>'pincode','') !~ '^[1-9][0-9]{5}$'
    or (cleaned->>'email' <> '' and (char_length(cleaned->>'email') > 254
      or cleaned->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')) then
    raise exception 'Enter a valid name, mobile, email and complete Indian address.';
  end if;
  if not exists (select 1 from public.carts where id = target_cart_id
    and delivery_pin_code = cleaned->>'pincode') then
    raise exception 'Verify the delivery pincode before saving your address.';
  end if;
  insert into public.cart_delivery_details(cart_id, details)
  values(target_cart_id, cleaned) on conflict(cart_id) do update
    set details = excluded.details, updated_at = now();
  return cleaned;
end $$;
revoke all on function public.save_cart_delivery_details(uuid, jsonb) from public, anon;
grant execute on function public.save_cart_delivery_details(uuid, jsonb) to authenticated;

create function public.invalidate_address_on_pin_change()
returns trigger language plpgsql security definer set search_path = ''
as $$ begin
  if old.delivery_pin_code is distinct from new.delivery_pin_code then
    delete from public.cart_delivery_details where cart_id = new.id;
  end if;
  return new;
end $$;
create trigger invalidate_address_on_pin_change after update of delivery_pin_code on public.carts
for each row execute function public.invalidate_address_on_pin_change();
revoke all on function public.invalidate_address_on_pin_change() from public,anon,authenticated;

create table public.welcome_offer (
  id boolean primary key default true check(id),
  enabled boolean not null default false,
  percent integer not null default 10 check(percent between 1 and 50),
  max_discount_rupees integer not null default 100 check(max_discount_rupees between 1 and 10000),
  minimum_subtotal_rupees integer not null default 500 check(minimum_subtotal_rupees between 1 and 100000),
  valid_days integer not null default 30 check(valid_days between 1 and 365)
);
insert into public.welcome_offer(id) values(true);
alter table public.welcome_offer enable row level security;
revoke all on public.welcome_offer from anon, authenticated;
grant select on public.welcome_offer to anon, authenticated;
grant update on public.welcome_offer to authenticated;
grant all on public.welcome_offer to service_role;
create policy "Public welcome offer terms" on public.welcome_offer for select using(true);
create policy "Admins can configure welcome offer" on public.welcome_offer for update to authenticated
using(public.is_catalogue_admin()) with check(public.is_catalogue_admin());

create table public.welcome_coupons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null unique,
  code text not null default 'ILOVELUVIA' check(code = 'ILOVELUVIA'),
  percent integer not null,
  max_discount_rupees integer not null,
  minimum_subtotal_rupees integer not null,
  expires_at timestamptz not null,
  email_sent_at timestamptz,
  redeemed_order_id uuid unique references public.payment_orders(id),
  created_at timestamptz not null default now()
);
alter table public.welcome_coupons enable row level security;
revoke all on public.welcome_coupons from anon, authenticated;
grant select on public.welcome_coupons to authenticated;
grant all on public.welcome_coupons to service_role;
create policy "Owners and admins read welcome coupons" on public.welcome_coupons for select to authenticated
using(user_id = auth.uid() or public.is_catalogue_admin());

create table public.manual_coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  welcome_coupon_id uuid unique references public.welcome_coupons(id),
  campaign_coupon_id uuid,
  customer_email text,
  customer_id uuid not null references auth.users(id),
  cart_id uuid references public.carts(id) on delete set null,
  cart_reference text not null,
  redeemed_by uuid not null references auth.users(id),
  redeemed_at timestamptz not null default now(),
  check((welcome_coupon_id is null) <> (campaign_coupon_id is null))
);
alter table public.manual_coupon_redemptions enable row level security;
revoke all on public.manual_coupon_redemptions from anon,authenticated;
grant select on public.manual_coupon_redemptions to authenticated;
grant all on public.manual_coupon_redemptions to service_role;
create policy "Admins read manual coupon redemptions" on public.manual_coupon_redemptions for select to authenticated
using(public.is_catalogue_admin());

create function public.claim_welcome_coupon(owner_id uuid)
returns public.welcome_coupons language plpgsql security definer set search_path = ''
as $$
declare customer auth.users; offer public.welcome_offer; coupon public.welcome_coupons;
begin
  if auth.role() is distinct from 'service_role' and owner_id is distinct from auth.uid() then
    raise exception 'Only the backend or coupon owner may claim this offer.';
  end if;
  if exists (select 1 from public.cart_session_blocks where user_id = owner_id) then
    raise exception 'This cart session has been blocked.';
  end if;
  select * into customer from auth.users where id = owner_id and email_confirmed_at is not null
    and email is not null and not coalesce(is_anonymous, false);
  if not found then raise exception 'Verify your account email before claiming a coupon.'; end if;
  select * into offer from public.welcome_offer where id and enabled;
  if not found then raise exception 'The welcome offer is not active yet.'; end if;
  if exists (select 1 from public.payment_orders where not is_test_checkout and status in ('paid','review_required')
    and (created_by = owner_id or lower(customer_email) = lower(customer.email))) then
    raise exception 'This offer is for first-time customers only.';
  end if;
  if exists(select 1 from public.manual_coupon_redemptions
    where customer_id=owner_id or customer_email=lower(customer.email)) then
    raise exception 'This offer is for first-time customers only.';
  end if;
  insert into public.welcome_coupons(user_id,email,percent,max_discount_rupees,minimum_subtotal_rupees,expires_at)
  values(owner_id,lower(customer.email),offer.percent,offer.max_discount_rupees,
    offer.minimum_subtotal_rupees,now()+make_interval(days=>offer.valid_days))
  on conflict(email) do nothing;
  select * into coupon from public.welcome_coupons where email = lower(customer.email) and user_id = owner_id;
  if not found or coupon.redeemed_order_id is not null or coupon.expires_at <= now() then
    raise exception 'Your welcome coupon is unavailable, expired or already used.';
  end if;
  return coupon;
end $$;
revoke all on function public.claim_welcome_coupon(uuid) from public, anon, authenticated;
grant execute on function public.claim_welcome_coupon(uuid) to service_role;

alter table public.cart_delivery_details add column welcome_coupon_id uuid references public.welcome_coupons(id);
alter table public.payment_orders add column welcome_coupon_id uuid references public.welcome_coupons(id),
  add column discount_paise bigint not null default 0 check(discount_paise >= 0 and discount_paise < subtotal_paise);
alter table public.payment_orders drop constraint payment_orders_check;
alter table public.payment_orders add constraint payment_orders_total_paise_check
  check(total_paise = subtotal_paise + shipping_paise - discount_paise);

create function public.select_cart_welcome_coupon(target_cart_id uuid, coupon_code text)
returns text language plpgsql security definer set search_path = ''
as $$
declare coupon public.welcome_coupons;
begin
  if not exists (select 1 from public.carts where id = target_cart_id and user_id = auth.uid()
    and expires_at > now()) then raise exception 'An active owned cart is required.'; end if;
  perform public.check_cart_write_limit(auth.uid(), 'write');
  if upper(btrim(coupon_code)) = 'ILOVELUVIA' then
    perform public.claim_welcome_coupon(auth.uid());
  end if;
  select * into coupon from public.welcome_coupons
  where code = upper(btrim(coupon_code)) and user_id = auth.uid()
    and expires_at > now() and redeemed_order_id is null
    and not exists(select 1 from public.manual_coupon_redemptions where welcome_coupon_id=welcome_coupons.id);
  if not found then raise exception 'This coupon is not valid for your account.'; end if;
  update public.cart_delivery_details set welcome_coupon_id = coupon.id,
    details=jsonb_set(details,'{email}',to_jsonb(coupon.email)) where cart_id = target_cart_id;
  if not found then raise exception 'Save your delivery details first.'; end if;
  return coupon.code;
end $$;
revoke all on function public.select_cart_welcome_coupon(uuid,text) from public, anon;
grant execute on function public.select_cart_welcome_coupon(uuid,text) to authenticated;

create table public.campaign_coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('LUVIA-' || upper(encode(extensions.gen_random_bytes(8),'hex'))),
  percent integer not null check(percent between 1 and 50),
  max_discount_rupees integer not null check(max_discount_rupees between 1 and 10000),
  minimum_subtotal_rupees integer not null check(minimum_subtotal_rupees between 1 and 100000),
  max_redemptions integer not null check(max_redemptions between 1 and 10000),
  first_order_only boolean not null default false,
  enabled boolean not null default true,
  expires_at timestamptz not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.campaign_coupons enable row level security;
revoke all on public.campaign_coupons from anon,authenticated;
grant select,update on public.campaign_coupons to authenticated;
grant all on public.campaign_coupons to service_role;
create policy "Admins can read campaign coupons" on public.campaign_coupons for select to authenticated
using(public.is_catalogue_admin());
create policy "Admins can disable campaign coupons" on public.campaign_coupons for update to authenticated
using(public.is_catalogue_admin()) with check(public.is_catalogue_admin());
revoke update on public.campaign_coupons from authenticated;
grant update(enabled) on public.campaign_coupons to authenticated;
alter table public.cart_delivery_details add column campaign_coupon_id uuid references public.campaign_coupons(id),
  add constraint cart_one_coupon_check check(welcome_coupon_id is null or campaign_coupon_id is null);
alter table public.payment_orders add column campaign_coupon_id uuid references public.campaign_coupons(id),
  add column coupon_customer_id uuid references auth.users(id);
create index payment_orders_campaign_coupon_idx on public.payment_orders(campaign_coupon_id)
where campaign_coupon_id is not null;
alter table public.manual_coupon_redemptions add foreign key(campaign_coupon_id) references public.campaign_coupons(id);
create unique index manual_campaign_cart_once_idx on public.manual_coupon_redemptions(campaign_coupon_id,cart_id)
where campaign_coupon_id is not null;
create function public.campaign_coupon_usage_count(coupon_id uuid,exclude_request uuid default null)
returns bigint language sql stable security definer set search_path = ''
as $$
  select (select count(*) from public.payment_orders where campaign_coupon_id=coupon_id
    and request_key is distinct from exclude_request
    and status in ('creating_link','link_created','paid','review_required')
    and (expires_at>now() or status in ('paid','review_required')))
    + (select count(*) from public.manual_coupon_redemptions where campaign_coupon_id=coupon_id);
$$;
revoke all on function public.campaign_coupon_usage_count(uuid,uuid) from public,anon,authenticated;
create policy "Owners can read their selected campaign coupon" on public.campaign_coupons for select to authenticated
using(exists(select 1 from public.cart_delivery_details d join public.carts c on c.id=d.cart_id
  where d.campaign_coupon_id=campaign_coupons.id and c.user_id=auth.uid() and c.expires_at>now()));

create function public.generate_campaign_coupon(
  discount_percent integer, discount_cap integer, minimum_subtotal integer,
  expiry timestamptz, usage_limit integer, first_order boolean
) returns public.campaign_coupons language plpgsql security definer set search_path = ''
as $$
declare result public.campaign_coupons;
begin
  if not public.is_catalogue_admin() then raise exception 'Only catalogue admins can generate coupons.'; end if;
  if discount_percent is null or discount_percent not between 1 and 50
    or discount_cap is null or discount_cap not between 1 and 10000
    or minimum_subtotal is null or minimum_subtotal not between 1 and 100000
    or expiry is null or expiry <= now() or expiry > now()+interval '365 days'
    or usage_limit is null or usage_limit not between 1 and 10000 or first_order is null then
    raise exception 'Enter valid discount, minimum, validity and usage limit.';
  end if;
  insert into public.campaign_coupons(percent,max_discount_rupees,minimum_subtotal_rupees,
    max_redemptions,first_order_only,expires_at,created_by)
  values(discount_percent,discount_cap,minimum_subtotal,usage_limit,first_order,
    expiry,auth.uid()) returning * into result;
  return result;
end $$;
revoke all on function public.generate_campaign_coupon(integer,integer,integer,timestamptz,integer,boolean) from public,anon;
grant execute on function public.generate_campaign_coupon(integer,integer,integer,timestamptz,integer,boolean) to authenticated;

create function public.select_cart_coupon(target_cart_id uuid,coupon_code text)
returns text language plpgsql security definer set search_path = ''
as $$
declare campaign public.campaign_coupons; owner_id uuid:=auth.uid(); email_address text;
begin
  if not exists(select 1 from public.carts where id=target_cart_id and user_id=owner_id and expires_at>now()) then
    raise exception 'An active owned cart is required.';
  end if;
  perform public.check_cart_write_limit(owner_id,'write');
  if coupon_code is null or btrim(coupon_code)='' then
    update public.cart_delivery_details set campaign_coupon_id=null,welcome_coupon_id=null where cart_id=target_cart_id;
    return null;
  end if;
  select * into campaign from public.campaign_coupons where code=upper(btrim(coupon_code))
    and enabled and expires_at>now();
  if not found then
    update public.cart_delivery_details set campaign_coupon_id=null where cart_id=target_cart_id;
    return public.select_cart_welcome_coupon(target_cart_id,coupon_code);
  end if;
  if public.campaign_coupon_usage_count(campaign.id)>=campaign.max_redemptions then
    raise exception 'This coupon has reached its usage limit.';
  end if;
  if campaign.first_order_only then
    select lower(email) into email_address from auth.users where id=owner_id
      and email_confirmed_at is not null and not coalesce(is_anonymous,false);
    if email_address is null then raise exception 'Verify your account email to use this first-order coupon.'; end if;
    if exists(select 1 from public.payment_orders where not is_test_checkout and status in ('paid','review_required')
      and (lower(customer_email)=email_address or coupon_customer_id=owner_id)) then
      raise exception 'This coupon is for first-time customers only.';
    end if;
    if exists(select 1 from public.manual_coupon_redemptions
      where customer_id=owner_id or customer_email=email_address) then
      raise exception 'This coupon is for first-time customers only.';
    end if;
  end if;
  update public.cart_delivery_details set campaign_coupon_id=campaign.id,welcome_coupon_id=null,
    details=case when campaign.first_order_only then jsonb_set(details,'{email}',to_jsonb(email_address)) else details end
  where cart_id=target_cart_id;
  if not found then raise exception 'Save your delivery details first.'; end if;
  return campaign.code;
end $$;
revoke all on function public.select_cart_coupon(uuid,text) from public,anon;
grant execute on function public.select_cart_coupon(uuid,text) to authenticated;

alter function public.prepare_payment_link_order(uuid,uuid,text,text,text,bigint)
rename to prepare_payment_link_order_without_coupon;
revoke all on function public.prepare_payment_link_order_without_coupon(uuid,uuid,text,text,text,bigint)
from public, anon, authenticated;
create function public.prepare_payment_link_order(
  p_cart_id uuid, p_request_key uuid, p_customer_name text,
  p_customer_contact text, p_customer_email text, p_shipping_paise bigint
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare coupon public.welcome_coupons; campaign public.campaign_coupons;
  result jsonb; target public.payment_orders; discount bigint; owner_id uuid; verified_email text;
  discount_percent integer; discount_cap integer; minimum_subtotal integer;
begin
  if not public.is_catalogue_admin() then raise exception 'Only catalogue admins can issue payment links.'; end if;
  select wc.* into coupon from public.welcome_coupons wc
    join public.cart_delivery_details d on d.welcome_coupon_id = wc.id
    where d.cart_id = p_cart_id for update of wc;
  if found then
    discount_percent:=coupon.percent; discount_cap:=coupon.max_discount_rupees;
    minimum_subtotal:=coupon.minimum_subtotal_rupees;
    if coupon.email is distinct from lower(btrim(p_customer_email))
      or coupon.user_id is distinct from (select user_id from public.carts where id = p_cart_id) then
      raise exception 'The coupon must match the verified customer account and email.';
    end if;
    if coupon.expires_at <= now() or coupon.redeemed_order_id is not null
      or exists(select 1 from public.manual_coupon_redemptions where welcome_coupon_id=coupon.id) then
      raise exception 'The welcome coupon has expired or already been redeemed.';
    end if;
    if exists (select 1 from public.payment_orders where welcome_coupon_id = coupon.id
      and request_key <> p_request_key and status in ('creating_link','link_created','paid','review_required')
      and (expires_at > now() or status in ('paid','review_required'))) then
      raise exception 'This coupon is reserved by another order.';
    end if;
    if exists (select 1 from public.payment_orders where not is_test_checkout and status in ('paid','review_required')
      and lower(customer_email) = coupon.email) then raise exception 'First-order offer already used.'; end if;
  end if;
  select cc.* into campaign from public.campaign_coupons cc
    join public.cart_delivery_details d on d.campaign_coupon_id=cc.id
    where d.cart_id=p_cart_id for update of cc;
  if found then
    if not campaign.enabled or campaign.expires_at<=now() then raise exception 'Coupon expired or disabled.'; end if;
    if public.campaign_coupon_usage_count(campaign.id,p_request_key)>=campaign.max_redemptions then
      raise exception 'This coupon has reached its usage limit.';
    end if;
    select user_id into owner_id from public.carts where id=p_cart_id;
    if campaign.first_order_only then
      select lower(email) into verified_email from auth.users where id=owner_id
        and email_confirmed_at is not null and not coalesce(is_anonymous,false);
      if verified_email is null or verified_email is distinct from lower(btrim(p_customer_email)) then
        raise exception 'First-order coupons require the verified customer email.';
      end if;
      if exists(select 1 from public.payment_orders where not is_test_checkout and status in ('paid','review_required')
        and (lower(customer_email)=verified_email or coupon_customer_id=owner_id)) then
        raise exception 'This coupon is for first-time customers only.';
      end if;
      if exists(select 1 from public.manual_coupon_redemptions
        where customer_id=owner_id or customer_email=verified_email) then
        raise exception 'This coupon is for first-time customers only.';
      end if;
    end if;
    discount_percent:=campaign.percent; discount_cap:=campaign.max_discount_rupees;
    minimum_subtotal:=campaign.minimum_subtotal_rupees;
  end if;
  if exists(select 1 from public.manual_coupon_redemptions where cart_id=p_cart_id) then
    raise exception 'This cart already has a completed manual coupon redemption.';
  end if;
  result := public.prepare_payment_link_order_without_coupon(p_cart_id,p_request_key,
    p_customer_name,p_customer_contact,p_customer_email,p_shipping_paise);
  if (coupon.id is null and campaign.id is null) or (result->>'reused')::boolean then return result; end if;
  select * into target from public.payment_orders where id = (result->>'id')::uuid;
  if target.subtotal_paise < minimum_subtotal::bigint * 100 then
    raise exception 'The cart subtotal is below the coupon minimum.';
  end if;
  discount := least(target.subtotal_paise * discount_percent / 100, discount_cap::bigint * 100);
  if target.total_paise - discount < 100 then raise exception 'Discounted payment must be at least 100 paise.'; end if;
  update public.payment_orders set welcome_coupon_id = coupon.id, campaign_coupon_id=campaign.id,
    coupon_customer_id=coalesce(owner_id,coupon.user_id), discount_paise = discount,
    total_paise = total_paise - discount where id = target.id;
  return result || jsonb_build_object('total_paise',target.total_paise-discount,'discount_paise',discount);
end $$;
revoke all on function public.prepare_payment_link_order(uuid,uuid,text,text,text,bigint) from public, anon;
grant execute on function public.prepare_payment_link_order(uuid,uuid,text,text,text,bigint) to authenticated;

alter function public.record_razorpay_payment_event(text,text,text,text,bigint)
rename to record_razorpay_payment_event_without_coupon;
revoke all on function public.record_razorpay_payment_event_without_coupon(text,text,text,text,bigint)
from public, anon, authenticated;
create function public.record_razorpay_payment_event(
  p_event_id text,p_event_name text,p_link_id text,p_payment_id text,p_amount_paise bigint
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare result jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Backend access required.'; end if;
  result := public.record_razorpay_payment_event_without_coupon(
    p_event_id,p_event_name,p_link_id,p_payment_id,p_amount_paise);
  update public.welcome_coupons wc set redeemed_order_id = o.id
  from public.payment_orders o where o.razorpay_link_id = p_link_id
    and o.status = 'paid' and o.welcome_coupon_id = wc.id and wc.redeemed_order_id is null;
  return result;
end $$;
revoke all on function public.record_razorpay_payment_event(text,text,text,text,bigint) from public, anon, authenticated;
grant execute on function public.record_razorpay_payment_event(text,text,text,text,bigint) to service_role;

-- Explicit admin attestation records an offline, already-paid order; it does not take payment or change stock.
create function public.redeem_cart_coupon_manually(target_cart_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare cart public.carts; details public.cart_delivery_details;
  welcome public.welcome_coupons; campaign public.campaign_coupons; email_address text;
begin
  if not public.is_catalogue_admin() then raise exception 'Only catalogue admins can record paid-order coupon use.'; end if;
  select * into cart from public.carts where id=target_cart_id and expires_at>now() for update;
  if not found then raise exception 'An active cart is required.'; end if;
  select * into details from public.cart_delivery_details where cart_id=cart.id;
  if not found or (details.welcome_coupon_id is null and details.campaign_coupon_id is null) then
    raise exception 'No coupon is selected for this cart.';
  end if;
  if exists(select 1 from public.payment_orders where cart_id=cart.id
    and status in ('creating_link','link_created','paid','review_required')
    and (expires_at>now() or status in ('paid','review_required'))) then
    raise exception 'Use the payment-link settlement for this order instead of manual redemption.';
  end if;
  if exists(select 1 from public.manual_coupon_redemptions where cart_id=cart.id) then
    raise exception 'Coupon use has already been recorded for this cart.';
  end if;
  if details.welcome_coupon_id is not null then
    select * into welcome from public.welcome_coupons where id=details.welcome_coupon_id for update;
    if welcome.user_id<>cart.user_id or welcome.expires_at<=now() or welcome.redeemed_order_id is not null
      or exists(select 1 from public.manual_coupon_redemptions where welcome_coupon_id=welcome.id) then
      raise exception 'The welcome coupon is expired or already used.';
    end if;
    if exists(select 1 from public.payment_orders where welcome_coupon_id=welcome.id
      and status in ('creating_link','link_created','paid','review_required')
      and (expires_at>now() or status in ('paid','review_required'))) then
      raise exception 'This coupon is reserved by a payment link.';
    end if;
    email_address:=welcome.email;
  else
    select * into campaign from public.campaign_coupons where id=details.campaign_coupon_id for update;
    if not campaign.enabled or campaign.expires_at<=now()
      or public.campaign_coupon_usage_count(campaign.id)>=campaign.max_redemptions then
      raise exception 'This coupon is expired, disabled or has reached its usage limit.';
    end if;
    if campaign.first_order_only then
      select lower(email) into email_address from auth.users where id=cart.user_id
        and email_confirmed_at is not null and not coalesce(is_anonymous,false);
      if email_address is null then raise exception 'First-order coupon requires a verified email.'; end if;
    else email_address:=nullif(details.details->>'email',''); end if;
  end if;
  if welcome.id is not null or campaign.first_order_only then
    if exists(select 1 from public.payment_orders where not is_test_checkout and status in ('paid','review_required')
      and lower(customer_email)=email_address)
      or exists(select 1 from public.manual_coupon_redemptions
        where customer_id=cart.user_id or customer_email=email_address) then
      raise exception 'This coupon is for first-time customers only.';
    end if;
  end if;
  insert into public.manual_coupon_redemptions(welcome_coupon_id,campaign_coupon_id,customer_email,
    customer_id,cart_id,cart_reference,redeemed_by)
  values(welcome.id,campaign.id,email_address,cart.user_id,cart.id,cart.reference,auth.uid());
  update public.cart_delivery_details set welcome_coupon_id=null,campaign_coupon_id=null where cart_id=cart.id;
end $$;
revoke all on function public.redeem_cart_coupon_manually(uuid) from public,anon;
grant execute on function public.redeem_cart_coupon_manually(uuid) to authenticated;

select cron.schedule('expire-cart-delivery-details','17 * * * *',
  $job$delete from public.cart_delivery_details d using public.carts c
    where d.cart_id=c.id and c.expires_at <= now();$job$);
