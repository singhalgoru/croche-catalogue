create or replace function public.hide_cancelled_live_order(target_order_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_catalogue_admin() then raise exception 'Catalogue admin access required.'; end if;
  update public.payment_orders set admin_hidden_at=now()
  where id=target_order_id and is_live_checkout and status in ('cancelled','expired')
    and razorpay_payment_id is null and paid_at is null;
  if not found then raise exception 'Only cancelled or expired, unpaid online orders can be removed from the list.'; end if;
end;
$$;
