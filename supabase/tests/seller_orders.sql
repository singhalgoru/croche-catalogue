begin;
create temporary table order_ledger_fixture as select gen_random_uuid() user_id,gen_random_uuid() session_id,gen_random_uuid() factor_id;
insert into auth.users(id) select user_id from order_ledger_fixture;
insert into public.catalogue_admins(user_id) select user_id from order_ledger_fixture;
insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at,secret)
select factor_id,user_id,'totp','verified',now(),now(),'fixture' from order_ledger_fixture;
insert into auth.sessions(id,user_id,factor_id,aal,created_at,updated_at)
select session_id,user_id,factor_id,'aal2',now(),now() from order_ledger_fixture;
select set_config('request.jwt.claims',jsonb_build_object('sub',user_id,'role','authenticated','aal','aal2','session_id',session_id,
  'amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from now())))))::text,true)
from order_ledger_fixture;
do $$
declare target uuid; payment uuid; actor uuid; before_count integer; rejected boolean; items jsonb;
begin
  if not public.is_catalogue_admin() then raise exception 'MFA fixture failed.'; end if;
  items='[{"product_id":null,"product_name":"Fixture A","variant_name":"","sale_date":"2026-10-23","channel":"offline",
    "quantity":2,"unit_price":100,"gst_percent":5,"material_cost":10,"labour_cost":5,
    "gateway_fee_percent":0,"gateway_fee_gst_percent":18},
    {"product_id":null,"product_name":"Fixture B","variant_name":"","sale_date":"2026-10-23","channel":"offline",
    "quantity":1,"unit_price":200,"gst_percent":12,"material_cost":20,"labour_cost":15,
    "gateway_fee_percent":0,"gateway_fee_gst_percent":18}]';
  target=public.create_seller_order(items,30,100);
  if (select count(*) from public.seller_sales where order_id=target)<>2
    or exists(select 1 from public.seller_sales where order_id=target and (shipping_cost<>0 or packaging_cost<>0))
    or not exists(select 1 from public.seller_orders where id=target and shipping_cost=100 and packaging_cost=30) then
    raise exception 'Order lines or shared costs incorrect.';
  end if;
  perform public.save_seller_order_costs(target,40,120,'manual');
  if not exists(select 1 from public.seller_orders where id=target and shipping_cost=120 and packaging_cost=40)
    then raise exception 'Manual cost update failed.'; end if;
  select count(*) into before_count from public.seller_orders;
  rejected=false;
  begin perform public.create_seller_order(jsonb_set(items,'{1,quantity}','0'),30,100);
  exception when others then rejected=true; end;
  if not rejected or (select count(*) from public.seller_orders)<>before_count then
    raise exception 'Invalid second item left a partial order.';
  end if;
  rejected=false;
  begin update public.seller_sales set shipping_cost=50 where order_id=target;
  exception when others then rejected=true; end;
  if not rejected then raise exception 'Item shipping could be charged twice.'; end if;
  rejected=false;
  begin update public.seller_sales set packaging_cost=10 where order_id=target;
  exception when others then rejected=true; end;
  if not rejected then raise exception 'Item packaging could be charged twice.'; end if;
  rejected=false;
  begin update public.seller_sales set sale_date='2026-09-01' where order_id=target;
  exception when others then rejected=true; end;
  if not rejected then raise exception 'One order could be split across reporting periods.'; end if;
  rejected=false;
  begin perform public.save_seller_order_costs(target,10,0,'courier');
  exception when others then rejected=true; end;
  if not rejected then raise exception 'Courier cost allowed without AWB.'; end if;
  select user_id into actor from order_ledger_fixture;
  insert into public.payment_orders(reference,request_key,created_by,customer_user_id,customer_name,customer_contact,customer_email,delivery_details,
    subtotal_paise,shipping_paise,total_paise,status,paid_at,expires_at,is_live_checkout,razorpay_order_id)
    values('LEDGER-TEST-'||target,gen_random_uuid(),actor,actor,'Fixture','+919876543210','fixture@example.test','{"email":"fixture@example.test"}',
      40000,0,40000,'paid',now(),now()+interval '1 day',true,'order_ledger_'||target) returning id into payment;
  update public.seller_orders set payment_order_id=payment,shipping_source='estimate' where id=target;
  insert into public.order_shipping(order_id,approved_charge) values(payment,85);
  if (select shipping_cost from public.seller_orders where id=target)<>120 then
    raise exception 'Unbooked courier approval changed shipping cost.'; end if;
  update public.order_shipping set awb='LEDGER-TEST-AWB' where order_id=payment;
  if not exists(select 1 from public.seller_orders where id=target and shipping_cost=85 and shipping_source='courier') then
    raise exception 'Successful AWB did not synchronize whole-order shipping.';
  end if;
  perform public.save_seller_order_costs(target,40,90,'manual');
  update public.order_shipping set approved_charge=95 where order_id=payment;
  if (select shipping_cost from public.seller_orders where id=target)<>90 then
    raise exception 'Courier overwrote explicit manual shipping override.'; end if;
  perform public.save_seller_order_costs(target,40,0,'courier');
  if (select shipping_cost from public.seller_orders where id=target)<>95 then
    raise exception 'Courier source trusted client charge instead of server quote.'; end if;
  perform public.delete_seller_order(target);
  if exists(select 1 from public.seller_sales where order_id=target) then raise exception 'Order deletion left orphan items.'; end if;
  if not exists(select 1 from public.payment_orders where id=payment) then raise exception 'Ledger delete removed customer order.'; end if;
end $$;
set local role anon;
do $$ declare rejected boolean=false;
begin
  begin perform public.create_seller_order('[]',0,0); exception when insufficient_privilege then rejected=true; end;
  if not rejected then raise exception 'Anonymous order writes allowed.'; end if;
  if has_table_privilege('anon','public.seller_orders','select') then raise exception 'Order costs exposed to buyers.'; end if;
end $$;
reset role;
select set_config('request.jwt.claims','{"role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
do $$ declare rejected boolean=false;
begin
  begin perform public.create_seller_order('[]',0,0); exception when others then rejected=true; end;
  if not rejected then raise exception 'Non-admin order write allowed.'; end if;
  if exists(select 1 from public.seller_orders) then raise exception 'Non-admin read private order costs.'; end if;
end $$;
reset role;
rollback;
