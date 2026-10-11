alter table public.campaign_coupons add column archived_at timestamptz;
alter table public.campaign_coupons add constraint archived_campaign_disabled
  check (archived_at is null or not enabled);

create function public.get_admin_campaign_coupons(archived boolean default false)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_catalogue_admin() then
    raise exception 'Only catalogue admins can view coupon usage.';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(c) || jsonb_build_object(
      'used_count', (select count(*) from public.payment_orders o
        where o.campaign_coupon_id=c.id and not o.is_test_checkout
          and (o.status='paid' or (o.status='review_required' and o.razorpay_payment_id is not null)))
        + (select count(*) from public.manual_coupon_redemptions r where r.campaign_coupon_id=c.id),
      'reserved_count', (select count(*) from public.payment_orders o
        where o.campaign_coupon_id=c.id and not o.is_test_checkout
          and ((o.status in ('creating_link','link_created') and o.expires_at>now())
            or (o.status='review_required' and o.razorpay_payment_id is null)))
    ) order by c.created_at desc, c.id)
    from (select * from public.campaign_coupons
      where (archived_at is not null)=archived
      order by created_at desc,id limit 50) c
  ), '[]'::jsonb);
end $$;

create function public.set_campaign_coupon_archived(coupon_id uuid, archive boolean)
returns public.campaign_coupons language plpgsql security definer set search_path = ''
as $$
declare result public.campaign_coupons;
begin
  if not public.is_catalogue_admin() then
    raise exception 'Only catalogue admins can archive coupons.';
  end if;
  update public.campaign_coupons
    set archived_at=case when archive then coalesce(archived_at,now()) else null end,
      enabled=case when archive then false else enabled end
    where id=coupon_id returning * into result;
  if not found then raise exception 'Coupon not found.'; end if;
  return result;
end $$;
revoke all on function public.get_admin_campaign_coupons(boolean) from public,anon;
revoke all on function public.set_campaign_coupon_archived(uuid,boolean) from public,anon;
grant execute on function public.get_admin_campaign_coupons(boolean) to authenticated;
grant execute on function public.set_campaign_coupon_archived(uuid,boolean) to authenticated;
