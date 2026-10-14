create function public.get_live_checkout_recovery(target_cart_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in to your cart session first.'; end if;
  select jsonb_build_object(
    'requestKey', request_key,
    'status', case
      when status = 'creating_link' and provider_claimed_at is not null and razorpay_order_id is null then 'review_required'
      else status
    end,
    'reference', reference,
    'cartMatches', exists(
      select 1 from public.carts c join public.cart_delivery_details d on d.cart_id = c.id
      where c.id = o.cart_id and c.user_id = auth.uid()
        and d.details = o.delivery_details
        and c.delivery_pin_code is not distinct from o.delivery_pincode
        and d.welcome_coupon_id is not distinct from o.welcome_coupon_id
        and d.campaign_coupon_id is not distinct from o.campaign_coupon_id
        and not exists(
          (select variant_id::text, quantity, unit_price_paise from public.payment_order_items where order_id = o.id
           except select variant_id, quantity, round(unit_price * 100)::bigint from public.cart_items where cart_id = c.id)
          union all
          (select variant_id, quantity, round(unit_price * 100)::bigint from public.cart_items where cart_id = c.id
           except select variant_id::text, quantity, unit_price_paise from public.payment_order_items where order_id = o.id)
        )
        and o.shipping_paise = case
          when o.subtotal_paise - o.discount_paise >= 50000 then 0
          when c.delivery_estimate is not null and
            (c.delivery_estimate->>'itemCount')::integer = (select sum(quantity) from public.cart_items where cart_id = c.id)
            then ceil((c.delivery_estimate->>'minCharge')::numeric / 10)::bigint * 1000
          else 10000 end
    )
  ) into result
  from public.payment_orders o
  where customer_user_id = auth.uid() and created_by = auth.uid() and cart_id = target_cart_id and is_live_checkout
    and (
      (status = 'paid' and not exists(select 1 from public.cart_items where cart_id = target_cart_id))
      or status = 'review_required'
      or (status in ('creating_link', 'link_created') and expires_at > now())
      or (status = 'creating_link' and provider_claimed_at is not null and razorpay_order_id is null)
      or (status = 'expired' and razorpay_order_id is not null)
    )
  order by
    case
      when status = 'paid' then 0
      when status = 'review_required' or (status = 'creating_link' and provider_claimed_at is not null and razorpay_order_id is null) then 1
      else 2
    end,
    created_at desc
  limit 1;
  return result;
end;
$$;
revoke all on function public.get_live_checkout_recovery(uuid) from public,anon;
grant execute on function public.get_live_checkout_recovery(uuid) to authenticated;
