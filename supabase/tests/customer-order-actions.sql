begin;
do $$
declare
  customer_id uuid := gen_random_uuid(); other_id uuid := gen_random_uuid();
  test_cart_id uuid; cancelled_id uuid; paid_id uuid; expired_id uuid; failed_id uuid;
  product_id uuid; variant_id uuid; price integer; min_qty integer; result jsonb; history jsonb; denied boolean;
begin
  insert into auth.users(id, email, email_confirmed_at, is_anonymous)
    values (customer_id, customer_id::text || '@orders.test', now(), false),
      (other_id, other_id::text || '@orders.test', now(), false);
  select p.id, v.id, coalesce(v.price,p.price), p.minimum_order_quantity
    into strict product_id, variant_id, price, min_qty
    from public.products p join public.product_variants v on v.product_id = p.id
    where p.published and p.show_price and coalesce(v.price,p.price)>0 and p.minimum_order_quantity <= 10
      and not exists (select 1 from public.payment_order_items i join public.payment_orders o on o.id=i.order_id
        where i.variant_id=v.id and o.status in ('creating_link','link_created') and o.expires_at>now())
    limit 1;
  update public.product_variants set available_quantity=1000, in_stock=true where id=variant_id;
  perform set_config('request.jwt.claim.sub', customer_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  insert into public.carts(user_id) values(customer_id) returning id into test_cart_id;
  insert into public.payment_orders(reference,request_key,created_by,customer_user_id,customer_name,customer_contact,
    customer_email,subtotal_paise,shipping_paise,total_paise,expires_at,status,is_live_checkout,delivery_details,created_at)
    values ('TEST-CANCEL-' || customer_id,gen_random_uuid(),customer_id,customer_id,'Test Buyer','+919876543210',
      customer_id::text || '@orders.test',10000,0,10000,now()-interval '1 hour','cancelled',true,'{}',now())
    returning id into cancelled_id;
  insert into public.payment_order_items(order_id,product_id,variant_id,product_name,variant_name,image_url,unit_price_paise,quantity)
    values(cancelled_id,product_id,variant_id,'Old product name','Old variant name','https://example.test/photo.jpg',10000,2),
      (cancelled_id,gen_random_uuid(),gen_random_uuid(),'Deleted product','Gone','https://example.test/photo.jpg',10000,1);
  insert into public.payment_orders(reference,request_key,created_by,customer_user_id,customer_name,customer_contact,
    customer_email,subtotal_paise,shipping_paise,total_paise,expires_at,status,is_live_checkout,delivery_details,
    razorpay_order_id,paid_at,created_at)
    values ('TEST-PAID-' || customer_id,gen_random_uuid(),customer_id,customer_id,'Test Buyer','+919876543210',
      customer_id::text || '@orders.test',10000,0,10000,now()-interval '1 hour','paid',true,'{}',
      'order_test_' || customer_id,now()-interval '2 days',now()-interval '2 days')
    returning id into paid_id;
  insert into public.payment_order_items(order_id,product_id,variant_id,product_name,variant_name,image_url,unit_price_paise,quantity)
    values(paid_id,product_id,variant_id,'Old name','Old variant','https://example.test/photo.jpg',10000,1);
  for i in 1..21 loop
    insert into public.payment_orders(reference,request_key,created_by,customer_user_id,customer_name,customer_contact,
      customer_email,subtotal_paise,shipping_paise,total_paise,expires_at,status,is_live_checkout,delivery_details)
      values ('TEST-OLD-' || customer_id || '-' || i,gen_random_uuid(),customer_id,customer_id,'Test Buyer','+919876543210',
        customer_id::text || '@orders.test',10000,0,10000,now()-interval '1 hour',
        case when i=1 then 'expired' when i=2 then 'link_failed' else 'cancelled' end,true,'{}')
      returning id into expired_id;
    if i=2 then failed_id := expired_id; end if;
  end loop;
  history := public.get_customer_orders();
  if history->0->>'id' <> paid_id::text or jsonb_array_length(history) <> 20 then
    raise exception 'Active orders must sort before pagination.';
  end if;
  result := public.reorder_customer_order(cancelled_id,test_cart_id);
  if (result->>'added')::int <> 1 or jsonb_array_length(result->'skipped') <> 1 then
    raise exception 'Reorder must add available items and report deleted items.';
  end if;
  if not exists(select 1 from public.cart_items ci where ci.cart_id=test_cart_id
    and ci.quantity=greatest(2,min_qty) and ci.unit_price=price and ci.product_name <> 'Old product name') then
    raise exception 'Reorder did not use current facts and minimum quantity.';
  end if;
  result := public.reorder_customer_order(paid_id,test_cart_id);
  if (result->>'added')::int <> 1 or not exists(select 1 from public.cart_items ci where ci.cart_id=test_cart_id
    and ci.quantity=greatest(2,min_qty)+min_qty) then raise exception 'Paid reorder did not merge with existing cart.'; end if;
  update public.product_variants set available_quantity=0, in_stock=false where id=variant_id;
  result := public.reorder_customer_order(paid_id,test_cart_id);
  if (result->>'added')::int <> 0 or jsonb_array_length(result->'skipped') <> 1 then
    raise exception 'Sold-out items must be skipped explicitly.';
  end if;
  update public.product_variants set available_quantity=1000, in_stock=true where id=variant_id;
  update public.payment_orders set status='link_created',expires_at=now()+interval '30 minutes',
    razorpay_order_id='order_pending_' || customer_id where id=failed_id;
  insert into public.payment_order_items(order_id,product_id,variant_id,product_name,variant_name,image_url,unit_price_paise,quantity)
    values(failed_id,product_id,variant_id,'Reserved','Reserved','https://example.test/photo.jpg',10000,99);
  update public.product_variants set available_quantity=99 where id=variant_id;
  result := public.reorder_customer_order(paid_id,test_cart_id);
  if (result->>'added')::int <> 0 then raise exception 'Reorder ignored active payment stock reservations.'; end if;
  denied := false;
  begin perform public.reorder_customer_order(failed_id,test_cart_id);
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'Pending payment must block reorder.'; end if;
  update public.payment_orders set expires_at=now()-interval '1 minute' where id=failed_id;
  perform public.set_customer_order_hidden(failed_id,true);
  history := public.get_customer_orders(0,true);
  if history->0->>'status' <> 'expired' then raise exception 'Elapsed payment must appear expired in Hidden orders.'; end if;
  update public.payment_orders set status='paid',paid_at=now() where id=failed_id;
  if public.get_customer_orders(0,true) <> '[]'::jsonb then raise exception 'Late paid order stayed hidden.'; end if;
  if not exists(select 1 from jsonb_array_elements(public.get_customer_orders()) entry
    where entry->>'id'=failed_id::text and entry->>'status'='paid') then raise exception 'Late paid order must return to active orders.'; end if;
  perform public.set_customer_order_hidden(cancelled_id,true);
  if not exists(select 1 from public.customer_hidden_orders h where h.order_id=cancelled_id and h.user_id=customer_id)
    or not exists(select 1 from public.payment_orders where id=cancelled_id) then raise exception 'Hide must preserve payment records.'; end if;
  perform public.set_customer_order_hidden(cancelled_id,false);
  if exists(select 1 from public.customer_hidden_orders h where h.order_id=cancelled_id) then raise exception 'Restore failed.'; end if;
  denied := false;
  begin perform public.set_customer_order_hidden(paid_id,true);
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'Paid order should not be hidden.'; end if;
  perform set_config('request.jwt.claim.sub', other_id::text, true);
  denied := false;
  begin perform public.reorder_customer_order(paid_id,test_cart_id);
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'Other customer reordered a private order.'; end if;
  denied := false;
  begin perform public.set_customer_order_hidden(cancelled_id,true);
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'Other customer hid a private order.'; end if;
  if public.get_customer_orders() <> '[]'::jsonb then raise exception 'Order history leaked to another customer.'; end if;
  if has_function_privilege('anon','public.reorder_customer_order(uuid,uuid)','execute')
    or has_function_privilege('anon','public.set_customer_order_hidden(uuid,boolean)','execute') then
    raise exception 'Anonymous users can execute customer order actions.';
  end if;
end;
$$;
rollback;
