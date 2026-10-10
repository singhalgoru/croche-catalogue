create table public.checkout_settings (
  id boolean primary key default true check(id),
  live_enabled boolean not null default false
);
insert into public.checkout_settings default values;
alter table public.checkout_settings enable row level security;
revoke all on public.checkout_settings from public, anon, authenticated;
grant select on public.checkout_settings to anon, authenticated;
grant all on public.checkout_settings to service_role;
create policy "Read checkout availability" on public.checkout_settings for select using(true);

alter table public.payment_orders
  add column is_live_checkout boolean not null default false,
  add column provider_claimed_at timestamptz,
  add column delivery_details jsonb;
alter table public.payment_orders drop constraint payment_orders_link_details_check;
alter table public.payment_orders add constraint payment_orders_link_details_check
  check(is_test_checkout or is_live_checkout or
    ((status not in ('creating_link','link_failed')) = (razorpay_link_id is not null and payment_url is not null)));
alter table public.payment_orders add constraint payment_orders_live_details_check
  check(not is_live_checkout or (
    not is_test_checkout and customer_user_id is not null and delivery_details is not null
    and razorpay_link_id is null and payment_url is null
    and status in ('creating_link','link_created','link_failed','paid','expired','cancelled','review_required')
    and (status not in ('link_created','paid') or razorpay_order_id is not null)
  ));

create function public.prepare_live_checkout(target_cart_id uuid, owner_id uuid, request_id uuid)
returns public.payment_orders language plpgsql security definer set search_path = ''
as $$
declare
  cart public.carts; details public.cart_delivery_details; result public.payment_orders;
  coupon public.welcome_coupons; campaign public.campaign_coupons;
  verified_email text; line record; subtotal bigint := 0; discount bigint := 0;
  shipping bigint := 10000; reserved bigint; item_count integer := 0; line_count integer := 0;
  percent integer := 0; cap integer := 0; minimum integer := 0;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Backend access required.'; end if;
  if not exists(select 1 from public.checkout_settings where live_enabled) then raise exception 'Online payments are not enabled yet.'; end if;
  if request_id is null or owner_id is null then raise exception 'A checkout request and cart owner are required.'; end if;
  select * into cart from public.carts where id=target_cart_id and user_id=owner_id and expires_at>now() for update;
  if not found then raise exception 'An active owned cart is required.'; end if;
  perform public.check_cart_write_limit(owner_id,'write');
  select * into result from public.payment_orders where created_by=owner_id and request_key=request_id;
  if found then
    if not result.is_live_checkout or result.cart_id is distinct from target_cart_id then raise exception 'Request key belongs to another checkout.'; end if;
    return result;
  end if;
  if exists(select 1 from public.payment_orders where cart_id=cart.id and not is_test_checkout
    and (status='review_required' or (is_live_checkout and provider_claimed_at is not null and razorpay_order_id is null)
      or (status in ('creating_link','link_created') and expires_at>now()))) then
    raise exception 'This cart has a pending payment. Resume it or contact Luvia before paying again.';
  end if;
  select * into details from public.cart_delivery_details where cart_id=cart.id;
  if not found then raise exception 'Save your delivery address before payment.'; end if;
  details.details := public.clean_customer_address(details.details, coalesce(details.details->>'email',''));
  if cart.delivery_pin_code is distinct from details.details->>'pincode' then raise exception 'Save the matching delivery pincode before payment.'; end if;
  select lower(email) into verified_email from auth.users where id=owner_id and email_confirmed_at is not null and not coalesce(is_anonymous,false);
  if details.welcome_coupon_id is not null then
    select * into coupon from public.welcome_coupons where id=details.welcome_coupon_id for update;
    if coupon.id is null or coupon.user_id<>owner_id or verified_email is distinct from coupon.email
      or coupon.expires_at<=now() or coupon.redeemed_order_id is not null
      or exists(select 1 from public.manual_coupon_redemptions where welcome_coupon_id=coupon.id)
      or exists(select 1 from public.payment_orders where welcome_coupon_id=coupon.id and
        (status in ('paid','review_required') or (status in ('creating_link','link_created') and expires_at>now()))) then
      raise exception 'The welcome coupon is expired, reserved or already used. Sign in with its verified account.';
    end if;
    percent:=coupon.percent; cap:=coupon.max_discount_rupees; minimum:=coupon.minimum_subtotal_rupees;
  elsif details.campaign_coupon_id is not null then
    select * into campaign from public.campaign_coupons where id=details.campaign_coupon_id for update;
    if campaign.id is null or not campaign.enabled or campaign.expires_at<=now()
      or public.campaign_coupon_usage_count(campaign.id)>=campaign.max_redemptions then raise exception 'This coupon is unavailable.'; end if;
    if campaign.first_order_only and verified_email is null then raise exception 'Verify your email to use this first-order coupon.'; end if;
    percent:=campaign.percent; cap:=campaign.max_discount_rupees; minimum:=campaign.minimum_subtotal_rupees;
  end if;
  if coupon.id is not null or campaign.first_order_only then
    if exists(select 1 from public.payment_orders where not is_test_checkout and status in ('paid','review_required')
      and (customer_user_id=owner_id or lower(customer_email)=verified_email))
      or exists(select 1 from public.manual_coupon_redemptions where customer_id=owner_id or customer_email=verified_email) then
      raise exception 'This coupon is for your first order only.';
    end if;
    details.details:=jsonb_set(details.details,'{email}',to_jsonb(verified_email));
  end if;
  insert into public.payment_orders(reference,request_key,cart_id,created_by,customer_name,customer_contact,
    customer_email,delivery_pincode,delivery_details,subtotal_paise,shipping_paise,total_paise,status,expires_at,is_live_checkout)
  values('LUV-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),request_id,cart.id,owner_id,
    details.details->>'name','+91'||(details.details->>'phone'),nullif(details.details->>'email',''),
    cart.delivery_pin_code,details.details,100,0,100,'creating_link',now()+interval '30 minutes',true)
  returning * into result;
  for line in
    select p.id as product_id,p.name as product_name,p.public_slug,p.published,p.minimum_order_quantity,p.show_price,
      v.id as variant_id,v.name as variant_name,v.image_url,v.in_stock,v.available_quantity,
      coalesce(v.price,p.price) as price, ci.quantity
    from public.cart_items ci join public.products p on p.id=ci.product_id::uuid
    join public.product_variants v on v.id=ci.variant_id::uuid and v.product_id=p.id
    where ci.cart_id=cart.id order by p.id,v.id for update of p,v
  loop
    select coalesce(sum(i.quantity),0) into reserved from public.payment_order_items i
      join public.payment_orders o on o.id=i.order_id where i.variant_id=line.variant_id and not o.is_test_checkout
      and o.status in ('creating_link','link_created') and o.expires_at>now();
    if not line.published or not line.in_stock or line.quantity>line.available_quantity-reserved
      or line.quantity<coalesce(line.minimum_order_quantity,1) then raise exception 'A cart item is unavailable or has an invalid quantity.'; end if;
    if not line.show_price or line.price is null or line.price<=0 then raise exception 'Every item needs a listed price before payment.'; end if;
    subtotal:=subtotal+round(line.price*100)::bigint*line.quantity;
    item_count:=item_count+line.quantity; line_count:=line_count+1;
    insert into public.payment_order_items(order_id,product_id,variant_id,product_name,variant_name,product_public_slug,image_url,unit_price_paise,quantity)
    values(result.id,line.product_id,line.variant_id,line.product_name,line.variant_name,line.public_slug,line.image_url,round(line.price*100)::bigint,line.quantity);
  end loop;
  if item_count=0 or line_count<>(select count(*) from public.cart_items where cart_id=cart.id) then raise exception 'Add available items before payment.'; end if;
  if subtotal<minimum::bigint*100 then raise exception 'Add more items to meet the coupon minimum of ₹%. Shipping is excluded.',minimum; end if;
  -- Match the cart's whole-rupee coupon rounding.
  discount:=least((subtotal*percent/10000)*100,cap::bigint*100);
  if subtotal-discount>=50000 then shipping:=0;
  elsif cart.delivery_estimate is not null and cart.delivery_pin_code is not null
    and (cart.delivery_estimate->>'itemCount')::integer=item_count then
    shipping:=ceil((cart.delivery_estimate->>'minCharge')::numeric/10)::bigint*1000;
  end if;
  if shipping is null or shipping<0 or subtotal-discount+shipping not between 100 and 100000000 then raise exception 'Invalid payment amount.'; end if;
  update public.payment_orders set subtotal_paise=subtotal,shipping_paise=shipping,discount_paise=discount,
    total_paise=subtotal-discount+shipping,welcome_coupon_id=coupon.id,campaign_coupon_id=campaign.id,
    coupon_customer_id=case when coupon.id is not null or campaign.first_order_only then owner_id else null end
    where id=result.id returning * into result;
  return result;
end;
$$;
revoke all on function public.prepare_live_checkout(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.prepare_live_checkout(uuid,uuid,uuid) to service_role;

create function public.settle_live_checkout(p_order_id uuid, payment_id text, amount_paise bigint, payment_currency text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare target public.payment_orders; item record; available bigint; coupon public.welcome_coupons; locked_cart_id uuid;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Backend access required.'; end if;
  select o.cart_id into locked_cart_id from public.payment_orders o where o.id=p_order_id;
  perform 1 from public.carts where id=locked_cart_id for update;
  select * into target from public.payment_orders where id=p_order_id and is_live_checkout for update;
  if not found or payment_id is null or payment_id !~ '^pay_[A-Za-z0-9]+$' then raise exception 'Live order not found or invalid payment.'; end if;
  if target.total_paise is distinct from amount_paise or target.currency is distinct from payment_currency then raise exception 'Captured amount or currency does not match.'; end if;
  if target.status='paid' then
    if target.razorpay_payment_id is distinct from payment_id then raise exception 'Order already has a different payment.'; end if;
    return jsonb_build_object('status','paid','reference',target.reference);
  end if;
  if target.status<>'link_created' or target.expires_at<=now() then
    update public.payment_orders set status='review_required',razorpay_payment_id=payment_id where id=target.id;
    return jsonb_build_object('status','review_required','reference',target.reference);
  end if;
  if target.welcome_coupon_id is not null then
    select * into coupon from public.welcome_coupons where id=target.welcome_coupon_id for update;
    if coupon.redeemed_order_id is not null or exists(select 1 from public.manual_coupon_redemptions where welcome_coupon_id=coupon.id) then
      update public.payment_orders set status='review_required',razorpay_payment_id=payment_id where id=target.id;
      return jsonb_build_object('status','review_required','reference',target.reference);
    end if;
    if not exists(select 1 from public.payment_order_items where order_id=target.id)
      or exists(select 1 from public.payment_order_items i where i.order_id=target.id and
        (not exists(select 1 from public.products p where p.id=i.product_id)
          or not exists(select 1 from public.product_variants v where v.id=i.variant_id))) then
      update public.payment_orders set status='review_required',razorpay_payment_id=payment_id where id=target.id;
      return jsonb_build_object('status','review_required','reference',target.reference);
    end if;
  end if;
  for item in select i.*,p.id as locked_product from public.payment_order_items i
    join public.products p on p.id=i.product_id where i.order_id=target.id order by p.id,i.variant_id for update of p
  loop
    select available_quantity into available from public.product_variants where id=item.variant_id for update;
    if not found or available<item.quantity then
      update public.payment_orders set status='review_required',razorpay_payment_id=payment_id where id=target.id;
      return jsonb_build_object('status','review_required','reference',target.reference);
    end if;
  end loop;
  for item in select * from public.payment_order_items where order_id=target.id order by product_id,variant_id loop
    update public.product_variants set available_quantity=available_quantity-item.quantity,
      in_stock=available_quantity-item.quantity>0,updated_at=now() where id=item.variant_id;
    update public.products set in_stock=exists(select 1 from public.product_variants where product_id=products.id and in_stock),
      updated_at=now() where id=item.product_id;
  end loop;
  update public.payment_orders set status='paid',paid_at=now(),razorpay_payment_id=payment_id,updated_at=now() where id=target.id;
  update public.welcome_coupons set redeemed_order_id=target.id where id=target.welcome_coupon_id;
  -- Only clear an unchanged cart; edits made in another tab must not be lost.
  perform 1 from public.carts where id=target.cart_id for update;
  if (select count(*) from public.cart_items where cart_id=target.cart_id) =
    (select count(*) from public.payment_order_items where order_id=target.id)
    and not exists(select 1 from public.cart_items ci where ci.cart_id=target.cart_id and
      not exists(select 1 from public.payment_order_items i where i.order_id=target.id
        and i.product_id::text=ci.product_id and i.variant_id::text=ci.variant_id and i.quantity=ci.quantity)) then
    delete from public.cart_items where cart_id=target.cart_id;
    update public.cart_delivery_details set welcome_coupon_id=null,campaign_coupon_id=null where cart_id=target.cart_id;
  end if;
  return jsonb_build_object('status','paid','reference',target.reference);
end;
$$;
revoke all on function public.settle_live_checkout(uuid,text,bigint,text) from public,anon,authenticated;
grant execute on function public.settle_live_checkout(uuid,text,bigint,text) to service_role;

alter function public.record_razorpay_checkout_event(text,text,text,text,bigint,text) rename to record_test_checkout_event;
create function public.record_razorpay_checkout_event(p_event_id text,p_event_name text,p_order_id text,
  p_payment_id text,p_amount_paise bigint,p_currency text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare target public.payment_orders; result jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Backend access required.'; end if;
  select * into target from public.payment_orders where razorpay_order_id=p_order_id;
  if not found then return jsonb_build_object('reason','unknown_checkout_order'); end if;
  if not target.is_live_checkout then
    return public.record_test_checkout_event(p_event_id,p_event_name,p_order_id,p_payment_id,p_amount_paise,p_currency);
  end if;
  if p_event_id is null or p_event_id !~ '^[A-Za-z0-9._:-]{1,200}$'
    or p_event_name not in ('payment.captured','order.paid') then raise exception 'Invalid checkout event.'; end if;
  insert into public.payment_webhook_events(event_id,event_name) values(p_event_id,p_event_name) on conflict(event_id) do nothing;
  if not found then return jsonb_build_object('processed',false,'duplicate',true); end if;
  result:=public.settle_live_checkout(target.id,p_payment_id,p_amount_paise,p_currency);
  return result||jsonb_build_object('processed',true,'test_mode',false);
end;
$$;
revoke all on function public.record_razorpay_checkout_event(text,text,text,text,bigint,text) from public,anon,authenticated;
grant execute on function public.record_razorpay_checkout_event(text,text,text,text,bigint,text) to service_role;

create function public.get_live_checkout_status(request_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in to your cart session first.'; end if;
  select jsonb_build_object('status',status,'reference',reference) into result from public.payment_orders
    where created_by=auth.uid() and request_key=request_id and is_live_checkout;
  return result;
end;
$$;
revoke all on function public.get_live_checkout_status(uuid) from public,anon;
grant execute on function public.get_live_checkout_status(uuid) to authenticated;
