alter table public.payment_orders add column admin_hidden_at timestamptz;

create function public.hide_cancelled_live_order(target_order_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_catalogue_admin() then raise exception 'Catalogue admin access required.'; end if;
  update public.payment_orders set admin_hidden_at=now()
  where id=target_order_id and is_live_checkout and status='cancelled'
    and razorpay_payment_id is null and paid_at is null;
  if not found then raise exception 'Only cancelled, unpaid online orders can be removed from the list.'; end if;
end;
$$;
revoke all on function public.hide_cancelled_live_order(uuid) from public,anon;
grant execute on function public.hide_cancelled_live_order(uuid) to authenticated;

create function public.restore_changed_live_order_visibility()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.status is distinct from old.status and new.status<>'cancelled' then new.admin_hidden_at:=null; end if;
  return new;
end;
$$;
revoke all on function public.restore_changed_live_order_visibility() from public,anon,authenticated;
create trigger restore_changed_live_order_visibility before update of status on public.payment_orders
for each row execute function public.restore_changed_live_order_visibility();

create function public.expire_live_checkouts()
returns void language plpgsql security definer set search_path = ''
as $$
begin
  update public.payment_orders set status='expired',updated_at=now()
  where is_live_checkout and expires_at<=now() and razorpay_payment_id is null
    and (status='link_created' or (status='creating_link' and provider_claimed_at is null));
end;
$$;
revoke all on function public.expire_live_checkouts() from public,anon,authenticated;
grant execute on function public.expire_live_checkouts() to service_role;
select cron.schedule('expire-live-checkouts','* * * * *',
  $job$select public.expire_live_checkouts();$job$);
select public.expire_live_checkouts();

create or replace function public.replace_unattempted_live_checkout(target_cart_id uuid, owner_id uuid,
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
  if previous.status not in ('link_created','cancelled','expired') or previous.razorpay_payment_id is not null then
    raise exception 'Previous payment needs verification; do not pay again.';
  end if;
  update public.payment_orders set status='cancelled',updated_at=now() where id=previous.id;
  return public.prepare_live_checkout(target_cart_id,owner_id,request_id);
end;
$$;

create or replace function public.get_admin_live_orders(page_offset integer default 0)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare result jsonb;
begin
  if not public.is_catalogue_admin() then raise exception 'Catalogue admin access required.'; end if;
  if page_offset is null or page_offset<0 then raise exception 'Invalid order page.'; end if;
  select coalesce(jsonb_agg(entry order by created_at desc,id desc),'[]'::jsonb) into result from (
    select o.id,o.created_at,jsonb_build_object(
      'id',o.id,'reference',o.reference,
      'status',case when o.status='link_created' and o.expires_at<=now() then 'expired' else o.status end,
      'createdAt',o.created_at,'paidAt',o.paid_at,'expiresAt',o.expires_at,
      'customerName',o.customer_name,'deliveryPincode',o.delivery_pincode,'deliveryDetails',o.delivery_details,
      'subtotal',o.subtotal_paise/100.0,'discount',o.discount_paise/100.0,'shipping',o.shipping_paise/100.0,'total',o.total_paise/100.0,
      'items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'productName',i.product_name,
        'variantName',i.variant_name,'quantity',i.quantity,'unitPrice',i.unit_price_paise/100.0,'lineTotal',i.line_total_paise/100.0)
        order by i.id) from public.payment_order_items i where i.order_id=o.id),'[]'::jsonb)
    ) as entry from public.payment_orders o where o.is_live_checkout and o.admin_hidden_at is null
    order by o.created_at desc,o.id desc limit 20 offset page_offset
  ) orders;
  return result;
end;
$$;
