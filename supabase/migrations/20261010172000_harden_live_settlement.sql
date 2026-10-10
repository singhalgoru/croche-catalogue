create or replace function public.settle_live_checkout(p_order_id uuid, payment_id text, amount_paise bigint, payment_currency text)
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
  if target.razorpay_payment_id is not null and target.razorpay_payment_id is distinct from payment_id then
    raise exception 'Order already has a different payment.';
  end if;
  if target.status='paid' then
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
  end if;
  if not exists(select 1 from public.payment_order_items where order_id=target.id)
    or exists(select 1 from public.payment_order_items i where i.order_id=target.id and
      (not exists(select 1 from public.products p where p.id=i.product_id)
        or not exists(select 1 from public.product_variants v where v.id=i.variant_id and v.product_id=i.product_id))) then
    update public.payment_orders set status='review_required',razorpay_payment_id=payment_id where id=target.id;
    return jsonb_build_object('status','review_required','reference',target.reference);
  end if;
  for item in select i.*,p.id as locked_product from public.payment_order_items i
    join public.products p on p.id=i.product_id where i.order_id=target.id order by p.id,i.variant_id for update of p
  loop
    select available_quantity into available from public.product_variants where id=item.variant_id and product_id=item.product_id for update;
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
