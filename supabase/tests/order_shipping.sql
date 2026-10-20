begin;
create temporary table shipping_fixture as select gen_random_uuid() actor_id,gen_random_uuid() order_id;
insert into auth.users(id) select actor_id from shipping_fixture;
insert into public.payment_orders(id,reference,request_key,created_by,customer_user_id,
  customer_name,customer_contact,customer_email,delivery_pincode,delivery_details,
  subtotal_paise,shipping_paise,total_paise,status,paid_at,expires_at,is_live_checkout,razorpay_order_id)
select order_id,'SHIPPING-'||order_id,gen_random_uuid(),actor_id,actor_id,
  'Shipping Test','+919876543210','shipping@example.invalid','110001',
  '{"name":"Shipping Test","phone":"9876543210","email":"shipping@example.invalid","addressLine1":"12 Test Street","city":"Delhi","state":"Delhi","pincode":"110001"}',
  50000,0,50000,'paid',now(),now()+interval '1 day',true,'order_shipping_'||order_id from shipping_fixture;
do $$
declare f record; quoted timestamptz; claimed jsonb; estimate jsonb; rejected boolean; operation_id uuid:=gen_random_uuid();
begin
  select * into f from shipping_fixture;
  if has_table_privilege('authenticated','public.order_shipping','select')
    or has_function_privilege('authenticated','public.claim_order_shipping(uuid,uuid,text,uuid,bigint,timestamptz)','execute')
    or has_function_privilege('anon','public.sync_order_shipping(uuid,text)','execute') then
    raise exception 'FAIL: browser roles can access privileged shipping state.';
  end if;
  perform public.save_order_shipping_quote(f.order_id,'{"weight":0.5,"length":20,"breadth":15,"height":10}',
    '[{"id":10,"name":"Courier","charge":85,"days":3,"recommended":true}]',f.actor_id);
  select quoted_at into quoted from public.order_shipping where order_id=f.order_id;
  rejected:=false;
  begin perform public.claim_order_shipping(f.order_id,operation_id,'book',f.actor_id,10,quoted-interval '1 second');
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'FAIL: stale package approval accepted.'; end if;
  rejected:=false;
  begin perform public.claim_order_shipping(f.order_id,operation_id,'book',f.actor_id,99,quoted);
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'FAIL: unquoted courier accepted.'; end if;
  update public.order_shipping set quoted_at=now()-interval '16 minutes' where order_id=f.order_id;
  rejected:=false;
  begin perform public.claim_order_shipping(f.order_id,operation_id,'book',f.actor_id,10,now()-interval '16 minutes');
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'FAIL: expired rates accepted.'; end if;
  update public.order_shipping set quoted_at=quoted where order_id=f.order_id;
  claimed:=public.claim_order_shipping(f.order_id,operation_id,'book',f.actor_id,10,quoted);
  if claimed->>'operation'<>operation_id::text or claimed->>'approved_charge'<>'85'
    or claimed->>'approved_by'<>f.actor_id::text then raise exception 'FAIL: approval was not durably claimed.'; end if;
  rejected:=false;
  begin perform public.claim_order_shipping(f.order_id,gen_random_uuid(),'book',f.actor_id,10,quoted);
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'FAIL: concurrent booking was accepted.'; end if;
  rejected:=false;
  begin perform public.save_order_shipping_quote(f.order_id,'{}','[]',f.actor_id);
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'FAIL: quote changed while booking.'; end if;
  rejected:=false;
  begin update public.payment_orders set fulfilment_status='shipped' where id=f.order_id;
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'FAIL: manual fulfilment raced booking.'; end if;
  update public.order_shipping set operation=null,review_required=true where order_id=f.order_id;
  rejected:=false;
  begin perform public.claim_order_shipping(f.order_id,gen_random_uuid(),'book',f.actor_id,10,quoted);
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'FAIL: ambiguous booking automatically retried.'; end if;
  update public.order_shipping set review_required=false,shipment_id=123,provider_order_id=456,awb='AWB123'
    where order_id=f.order_id;
  estimate:=public.with_courier_delivery_estimate(jsonb_build_array(jsonb_build_object(
    'id',f.order_id,'fulfilment',jsonb_build_object('status','confirmed'))))->0->'fulfilment'->'deliveryEstimate';
  if estimate->>'courierName'<>'Courier' or (estimate->>'transitDays')::integer<>3
    or estimate->>'expectedDate' is not null then
    raise exception 'FAIL: booked courier estimate missing or a delivery date was invented.';
  end if;
  update public.order_shipping set estimated_delivery_date='2026-10-25' where order_id=f.order_id;
  estimate:=public.with_courier_delivery_estimate(jsonb_build_array(jsonb_build_object(
    'id',f.order_id,'fulfilment',jsonb_build_object('status','confirmed'))))->0->'fulfilment'->'deliveryEstimate';
  if estimate->>'expectedDate'<>'2026-10-25' then raise exception 'FAIL: latest tracking ETA not exposed.'; end if;
  if has_function_privilege('authenticated','public.with_courier_delivery_estimate(jsonb)','execute')
    or has_function_privilege('anon','public.get_customer_orders_before_courier_estimates(integer,boolean)','execute') then
    raise exception 'FAIL: private estimate enrichment or original history can be called directly.';
  end if;
  rejected:=false;
  begin perform public.claim_order_shipping(f.order_id,gen_random_uuid(),'book',f.actor_id,10,quoted);
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'FAIL: existing shipment was booked twice.'; end if;
  perform public.claim_order_shipping(f.order_id,operation_id,'pickup',f.actor_id);
  update public.order_shipping set operation=null,pickup_requested=true where order_id=f.order_id;
  rejected:=false;
  begin perform public.claim_order_shipping(f.order_id,gen_random_uuid(),'pickup',f.actor_id);
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'FAIL: duplicate pickup request accepted.'; end if;
  perform public.sync_order_shipping(f.order_id,'AWB ASSIGNED');
  if (select fulfilment_status from public.payment_orders where id=f.order_id)<>'confirmed' then
    raise exception 'FAIL: AWB creation marked an order shipped.'; end if;
  perform public.sync_order_shipping(f.order_id,'IN TRANSIT');
  if not exists(select 1 from public.payment_orders where id=f.order_id and fulfilment_status='shipped'
    and tracking_number='AWB123' and tracking_url='https://shiprocket.co/tracking/AWB123') then
    raise exception 'FAIL: tracking did not update customer fulfilment.';
  end if;
  update public.payment_orders set tracking_number='MANUAL-OTHER' where id=f.order_id;
  estimate:=public.with_courier_delivery_estimate(jsonb_build_array(jsonb_build_object(
    'id',f.order_id,'fulfilment',jsonb_build_object('status','shipped'))))->0->'fulfilment'->'deliveryEstimate';
  if estimate is distinct from 'null'::jsonb then raise exception 'FAIL: another shipment retained the old courier ETA.'; end if;
  update public.payment_orders set tracking_number='AWB123' where id=f.order_id;
  perform public.sync_order_shipping(f.order_id,'IN TRANSIT');
  if (select count(*) from public.order_confirmation_emails where order_id=f.order_id and kind='shipped')<>1 then
    raise exception 'FAIL: shipment email missing or duplicated.';
  end if;
  perform public.sync_order_shipping(f.order_id,'RTO DELIVERED');
  if (select fulfilment_status from public.payment_orders where id=f.order_id)<>'shipped' then
    raise exception 'FAIL: return delivery treated as customer delivery.'; end if;
  perform public.sync_order_shipping(f.order_id,'DELIVERED');
  perform public.sync_order_shipping(f.order_id,'IN TRANSIT');
  if (select fulfilment_status from public.payment_orders where id=f.order_id)<>'delivered' then
    raise exception 'FAIL: tracking moved fulfilment backwards.'; end if;
  if (select count(*) from public.order_confirmation_emails where order_id=f.order_id and kind='delivered')<>1 then
    raise exception 'FAIL: delivery email missing or duplicated.'; end if;
  update public.payment_orders set status='review_required',paid_at=null where id=f.order_id;
  rejected:=false;
  begin perform public.claim_order_shipping(f.order_id,gen_random_uuid(),'book',f.actor_id,10,quoted);
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'FAIL: unpaid order booked.'; end if;
end $$;
rollback;
