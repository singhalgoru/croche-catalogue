create function public.replace_unattempted_live_checkout(target_cart_id uuid, owner_id uuid,
  previous_request_id uuid, request_id uuid, expected_provider_order_id text)
returns public.payment_orders language plpgsql security definer set search_path = ''
as $$
declare previous public.payment_orders; replacement public.payment_orders;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Backend access required.'; end if;
  if request_id is null or request_id=previous_request_id then raise exception 'A new checkout request is required.'; end if;
  perform 1 from public.carts where id=target_cart_id and user_id=owner_id for update;
  if not found then raise exception 'An owned cart is required.'; end if;
  select * into previous from public.payment_orders where request_key=previous_request_id
    and customer_user_id=owner_id and cart_id=target_cart_id and is_live_checkout for update;
  if not found or previous.razorpay_order_id is distinct from expected_provider_order_id then
    raise exception 'Previous checkout does not match.';
  end if;
  select * into replacement from public.payment_orders where request_key=request_id and created_by=owner_id;
  if found then
    if previous.status<>'cancelled' or not replacement.is_live_checkout or replacement.cart_id<>target_cart_id then
      raise exception 'Replacement request does not match.';
    end if;
    return replacement;
  end if;
  if previous.status not in ('link_created','cancelled') or previous.razorpay_payment_id is not null then
    raise exception 'Previous payment needs verification; do not pay again.';
  end if;
  update public.payment_orders set status='cancelled',updated_at=now() where id=previous.id;
  return public.prepare_live_checkout(target_cart_id,owner_id,request_id);
end;
$$;
revoke all on function public.replace_unattempted_live_checkout(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.replace_unattempted_live_checkout(uuid,uuid,uuid,uuid,text) to service_role;
