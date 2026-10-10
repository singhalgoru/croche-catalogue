-- Admins can delete generated coupons that were never used on an order.
-- Used coupons stay for order history and must be disabled instead.
create function public.delete_campaign_coupon(coupon_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare target public.campaign_coupons;
begin
  if not public.is_catalogue_admin() then raise exception 'Only catalogue admins can delete coupons.'; end if;
  select * into target from public.campaign_coupons where id=coupon_id for update;
  if not found then raise exception 'Coupon not found.'; end if;
  if exists(select 1 from public.payment_orders where campaign_coupon_id=coupon_id)
    or exists(select 1 from public.manual_coupon_redemptions where campaign_coupon_id=coupon_id) then
    raise exception 'This coupon has already been used on an order. Disable it instead.';
  end if;
  update public.cart_delivery_details set campaign_coupon_id=null where campaign_coupon_id=coupon_id;
  delete from public.campaign_coupons where id=coupon_id;
end $$;
revoke all on function public.delete_campaign_coupon(uuid) from public,anon;
grant execute on function public.delete_campaign_coupon(uuid) to authenticated;
