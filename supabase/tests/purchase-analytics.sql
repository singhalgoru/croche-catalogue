begin;
do $$
declare owner_id uuid := gen_random_uuid(); other_id uuid := gen_random_uuid();
  request_id uuid := gen_random_uuid(); order_id uuid; snapshot jsonb;
begin
  insert into auth.users(id, email, email_confirmed_at, is_anonymous)
    values (owner_id, owner_id::text || '@analytics.test', now(), true),
      (other_id, other_id::text || '@analytics.test', now(), false);
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  insert into public.payment_orders(reference, request_key, created_by, customer_user_id, razorpay_order_id, customer_name, customer_contact,
    customer_email, subtotal_paise, discount_paise, shipping_paise, total_paise, expires_at,
    status, is_live_checkout, delivery_details)
    values ('TEST-ANALYTICS-' || owner_id, request_id, owner_id, owner_id, 'order_analytics_' || owner_id, 'Private Buyer', '+919876543210',
      'private@example.test', 100000, 10000, 10000, 100000, now() + interval '30 minutes',
      'link_created', true, '{}') returning id into order_id;
  insert into public.payment_order_items(order_id, product_id, variant_id, product_name, variant_name,
    image_url, unit_price_paise, quantity)
    values (order_id, gen_random_uuid(), gen_random_uuid(), 'Rose', 'Pink', 'https://example.test/photo.jpg', 25000, 4);
  if public.get_live_purchase_analytics(request_id) is not null then raise exception 'Unpaid order leaked into purchase analytics.'; end if;
  update public.payment_orders set status = 'paid', paid_at = now(), razorpay_order_id = 'order_analytics_' || owner_id where id = order_id;
  snapshot := public.get_live_purchase_analytics(request_id);
  if snapshot is null or (snapshot->>'value')::numeric <> 900 then
    raise exception 'Purchase revenue must exclude shipping and subtract discount.';
  end if;
  if (snapshot->>'total')::numeric <> 1000 or (snapshot->>'shipping')::numeric <> 100
    or (snapshot->'items'->0->>'quantity')::integer <> 4 or (snapshot->'items'->0->>'price')::numeric <> 250 then
    raise exception 'Purchase must use authoritative amounts and quantities.';
  end if;
  if snapshot::text like '%Private Buyer%' or snapshot::text like '%private@example.test%'
    or snapshot::text like '%9876543210%' then raise exception 'Purchase contains private contact details.'; end if;
  perform set_config('request.jwt.claim.sub', other_id::text, true);
  if public.get_live_purchase_analytics(request_id) is not null then raise exception 'Another customer can access purchase analytics.'; end if;
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  update public.payment_orders set is_live_checkout = false, is_test_checkout = true, status = 'test_verified', paid_at = null where id = order_id;
  if public.get_live_purchase_analytics(request_id) is not null then raise exception 'Test payment became a purchase.'; end if;
  if has_function_privilege('anon', 'public.get_live_purchase_analytics(uuid)', 'execute') then
    raise exception 'Anonymous role has purchase access.';
  end if;
end;
$$;
rollback;
