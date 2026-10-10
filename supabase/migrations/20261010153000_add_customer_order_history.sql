create function public.get_customer_orders(page_offset integer default 0)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  customer_id uuid := auth.uid();
  verified_email text;
  orders jsonb;
begin
  select lower(email) into verified_email from auth.users
  where id = customer_id and email_confirmed_at is not null and not coalesce(is_anonymous, false);
  if verified_email is null then raise exception 'Sign in with a verified email to view your orders.'; end if;
  if page_offset is null or page_offset < 0 then raise exception 'Invalid order history page.'; end if;
  select coalesce(jsonb_agg(entry order by created_at desc, id desc), '[]'::jsonb) into orders
  from (
    select o.id, o.created_at, jsonb_build_object(
      'id', o.id, 'reference', o.reference, 'status', o.status, 'createdAt', o.created_at,
      'paidAt', o.paid_at, 'customerName', o.customer_name, 'deliveryPincode', o.delivery_pincode,
      'subtotal', o.subtotal_paise / 100.0, 'discount', o.discount_paise / 100.0,
      'shipping', o.shipping_paise / 100.0, 'total', o.total_paise / 100.0,
      'items', coalesce((select jsonb_agg(jsonb_build_object(
        'id', i.id, 'productName', i.product_name, 'variantName', i.variant_name,
        'quantity', i.quantity, 'unitPrice', i.unit_price_paise / 100.0,
        'lineTotal', i.line_total_paise / 100.0
      ) order by i.id) from public.payment_order_items i where i.order_id = o.id), '[]'::jsonb)
    ) as entry
    from public.payment_orders o
    where not o.is_test_checkout and (
      lower(o.customer_email) = verified_email
      or exists (select 1 from public.carts c where c.id = o.cart_id and c.user_id = customer_id)
    )
    order by o.created_at desc, o.id desc limit 20 offset page_offset
  ) history;
  return orders;
end;
$$;
revoke all on function public.get_customer_orders(integer) from public, anon;
grant execute on function public.get_customer_orders(integer) to authenticated;
