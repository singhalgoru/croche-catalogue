create function public.get_live_purchase_analytics(request_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in to your cart session first.'; end if;
  select jsonb_build_object(
    'transaction_id', o.reference, 'currency', 'INR',
    'value', (o.subtotal_paise - o.discount_paise) / 100.0,
    'shipping', o.shipping_paise / 100.0, 'total', o.total_paise / 100.0,
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'item_id', i.product_id::text, 'item_name', i.product_name,
      'item_variant', i.variant_name, 'variant_id', i.variant_id::text,
      'price', i.unit_price_paise / 100.0, 'quantity', i.quantity
    ) order by i.id) from public.payment_order_items i where i.order_id = o.id), '[]'::jsonb)
  ) into result from public.payment_orders o
    where o.created_by = auth.uid() and o.request_key = request_id
      and o.is_live_checkout and not o.is_test_checkout and o.status = 'paid' and o.paid_at is not null;
  return result;
end;
$$;
revoke all on function public.get_live_purchase_analytics(uuid) from public, anon;
grant execute on function public.get_live_purchase_analytics(uuid) to authenticated;
