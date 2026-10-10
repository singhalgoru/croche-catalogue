create function public.get_admin_live_orders(page_offset integer default 0)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare result jsonb;
begin
  if not public.is_catalogue_admin() then raise exception 'Catalogue admin access required.'; end if;
  if page_offset is null or page_offset<0 then raise exception 'Invalid order page.'; end if;
  select coalesce(jsonb_agg(entry order by created_at desc,id desc),'[]'::jsonb) into result from (
    select o.id,o.created_at,jsonb_build_object(
      'id',o.id,'reference',o.reference,'status',o.status,'createdAt',o.created_at,'paidAt',o.paid_at,
      'customerName',o.customer_name,'deliveryPincode',o.delivery_pincode,'deliveryDetails',o.delivery_details,
      'subtotal',o.subtotal_paise/100.0,'discount',o.discount_paise/100.0,'shipping',o.shipping_paise/100.0,'total',o.total_paise/100.0,
      'items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'productName',i.product_name,
        'variantName',i.variant_name,'quantity',i.quantity,'unitPrice',i.unit_price_paise/100.0,'lineTotal',i.line_total_paise/100.0)
        order by i.id) from public.payment_order_items i where i.order_id=o.id),'[]'::jsonb)
    ) as entry from public.payment_orders o where o.is_live_checkout
    order by o.created_at desc,o.id desc limit 20 offset page_offset
  ) orders;
  return result;
end;
$$;
revoke all on function public.get_admin_live_orders(integer) from public,anon;
grant execute on function public.get_admin_live_orders(integer) to authenticated;
