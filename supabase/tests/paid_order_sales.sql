begin;
do $$
declare owner_id uuid := gen_random_uuid(); paid_order uuid; test_order_id uuid; target_product uuid;
  ledger record; line_count integer;
begin
  select p.id into target_product from public.products p
  where (select count(*) from public.product_variants v where v.product_id = p.id) = 1 limit 1;
  if target_product is null then raise exception 'Need a single-variant product to test sales recording.'; end if;
  insert into public.product_profit_margins(product_id, gst_percent, time_spent, time_unit, material_cost, shipping_cost, packaging_cost)
    values (target_product, 12, 90, 'minutes', 40, 60, 10)
    on conflict (product_id) do update set gst_percent = 12, time_spent = 90, time_unit = 'minutes',
      material_cost = 40, shipping_cost = 60, packaging_cost = 10, labour_rate = null;
  insert into auth.users(id, email, email_confirmed_at) values (owner_id, owner_id::text || '@sales.test', now());
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  insert into public.payment_orders(reference, request_key, created_by, customer_user_id, razorpay_order_id, customer_name,
    customer_contact, customer_email, subtotal_paise, discount_paise, shipping_paise, total_paise, expires_at,
    status, is_live_checkout, delivery_details)
    values ('TEST-SALES-' || owner_id, gen_random_uuid(), owner_id, owner_id, 'order_sales_' || owner_id, 'Buyer',
      '+919876543210', 'buyer@example.test', 100000, 10000, 5000, 95000, now() + interval '30 minutes',
      'link_created', true, '{"email":"buyer@example.test"}') returning id into paid_order;
  insert into public.payment_order_items(order_id, product_id, variant_id, product_name, variant_name, image_url, unit_price_paise, quantity)
    values (paid_order, target_product, gen_random_uuid(), 'Ledger Rose', 'Standard', 'https://example.test/a.jpg', 25000, 3),
      (paid_order, gen_random_uuid(), gen_random_uuid(), 'Removed Product', 'Blue', 'https://example.test/b.jpg', 12500, 2);

  if exists (select 1 from public.seller_sales s join public.payment_order_items i on i.id = s.payment_order_item_id where i.order_id = paid_order) then
    raise exception 'Unpaid order was recorded as a sale.';
  end if;

  update public.payment_orders set status = 'paid', paid_at = now() where id = paid_order;
  select count(*) into line_count from public.seller_sales s join public.payment_order_items i on i.id = s.payment_order_item_id where i.order_id = paid_order;
  if line_count <> 2 then raise exception 'Expected one sale per paid order line, got %.', line_count; end if;

  select s.* into ledger from public.seller_sales s join public.payment_order_items i on i.id = s.payment_order_item_id
  where i.order_id = paid_order and i.product_name = 'Ledger Rose';
  if ledger.channel <> 'online' or ledger.product_id <> target_product or ledger.quantity <> 3
    or ledger.unit_price <> 225 or ledger.variant_name <> '' or ledger.gst_percent <> 12
    or ledger.material_cost <> 40 or ledger.labour_cost <> 150 or ledger.packaging_cost <> 0
    or ledger.shipping_cost <> 0 or ledger.gateway_fee_percent <> 2 or ledger.gateway_fee_gst_percent <> 18
    or ledger.sale_date <> (now() at time zone 'Asia/Kolkata')::date
    or ledger.notes not like '%Customer paid ₹50.00 shipping%' then
    raise exception 'Paid line was recorded with wrong values: %', row_to_json(ledger);
  end if;
  if not exists(select 1 from public.seller_orders where id=ledger.order_id
    and payment_order_id=paid_order and packaging_cost=30 and shipping_cost=60 and shipping_collected=50)
    then raise exception 'Website shared costs not moved to the whole order.'; end if;

  select s.* into ledger from public.seller_sales s join public.payment_order_items i on i.id = s.payment_order_item_id
  where i.order_id = paid_order and i.product_name = 'Removed Product';
  if ledger.product_id is not null or ledger.unit_price <> 112.5 or ledger.shipping_cost <> 0
    or ledger.labour_cost <> 0 or ledger.gst_percent <> 5 or ledger.variant_name <> '' then
    raise exception 'Second line must take the discount remainder and no extra shipping: %', row_to_json(ledger);
  end if;

  update public.payment_orders set fulfilment_status = 'shipped' where id = paid_order;
  update public.payment_orders set status = 'paid' where id = paid_order;
  select count(*) into line_count from public.seller_sales s join public.payment_order_items i on i.id = s.payment_order_item_id where i.order_id = paid_order;
  if line_count <> 2 then raise exception 'Repeated paid updates duplicated sales.'; end if;

  insert into public.payment_orders(reference, request_key, created_by, customer_name, customer_contact, subtotal_paise,
    discount_paise, shipping_paise, total_paise, expires_at, status, is_live_checkout, razorpay_link_id, payment_url)
    values ('TEST-SALES-L-' || owner_id, gen_random_uuid(), owner_id, 'Buyer', '+919876543210', 100, 0, 0, 100,
      now() + interval '1 day', 'link_created', false, 'plink_' || owner_id, 'https://rzp.io/test') returning id into test_order_id;
  insert into public.payment_order_items(order_id, product_id, variant_id, product_name, variant_name, image_url, unit_price_paise, quantity)
    values (test_order_id, target_product, gen_random_uuid(), 'Link Rose', 'Standard', 'https://example.test/c.jpg', 100, 1);
  update public.payment_orders set status = 'paid', paid_at = now() where id = test_order_id;
  if exists (select 1 from public.seller_sales where product_name = 'Link Rose') then
    raise exception 'Only paid website checkouts may be recorded automatically.';
  end if;
  if has_function_privilege('anon', 'public.record_paid_order_sales()', 'execute')
    or has_function_privilege('authenticated', 'public.record_paid_order_sales()', 'execute') then
    raise exception 'Sales recording function is publicly executable.';
  end if;
end;
$$;
rollback;
