begin;
create temporary table labour_fixture as select gen_random_uuid() user_id,gen_random_uuid() session_id,gen_random_uuid() factor_id;
insert into auth.users(id) select user_id from labour_fixture;
insert into public.catalogue_admins(user_id) select user_id from labour_fixture;
insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at,secret)
select factor_id,user_id,'totp','verified',now(),now(),'fixture' from labour_fixture;
insert into auth.sessions(id,user_id,factor_id,aal,created_at,updated_at)
select session_id,user_id,factor_id,'aal2',now(),now() from labour_fixture;
select set_config('request.jwt.claims',jsonb_build_object('sub',user_id,'role','authenticated','aal','aal2','session_id',session_id,
  'amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from now())))))::text,true)
from labour_fixture;
do $$
declare product uuid; actor uuid; target uuid; paid_order uuid; hourly_rate numeric; ledger record; invalid_rate numeric;
  before_count integer; items jsonb; historical_id uuid;
begin
  select id into product from public.products limit 1;
  if product is null then raise exception 'Product fixture required.'; end if;
  select user_id into actor from labour_fixture;
  items='[{"product_id":null,"product_name":"Synthetic labour fixture","variant_name":"","sale_date":"2026-10-30",
    "channel":"offline","quantity":2,"unit_price":500,"gst_percent":5,"material_cost":10,"labour_cost":90,
    "labour_time_spent":30,"labour_time_unit":"minutes","labour_rate":180,"gateway_fee_percent":0,"gateway_fee_gst_percent":18}]';
  target=public.create_seller_order(items,10,20);
  if not exists(select 1 from public.seller_sales where order_id=target and labour_cost=90 and labour_time_spent=30
    and labour_time_unit='minutes' and labour_rate=180 and quantity=2) then raise exception 'Manual order lost labour snapshot.'; end if;
  foreach invalid_rate in array array[-1,10001,'NaN'::numeric,'Infinity'::numeric] loop
    select count(*) into before_count from public.seller_orders;
    begin
      perform public.create_seller_order(jsonb_set(items,'{0,labour_rate}',to_jsonb(invalid_rate)),10,20);
      raise exception 'FAIL: invalid sale rate accepted.';
    exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
    if (select count(*) from public.seller_orders)<>before_count then raise exception 'Partial order left after invalid labour rate.'; end if;
    begin
      update public.product_profit_margins set labour_rate=invalid_rate where product_id=product;
      if not found then
        insert into public.product_profit_margins(product_id,labour_rate) values(product,invalid_rate);
      end if;
      raise exception 'FAIL: invalid product rate accepted.';
    exception when check_violation then null; end;
  end loop;
  begin
    perform public.create_seller_order(jsonb_build_array((items->0)-'labour_time_unit'),10,20);
    raise exception 'FAIL: incomplete labour snapshot accepted.';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  perform public.delete_seller_order(target);

  foreach hourly_rate in array array[null::numeric,180,0] loop
    insert into public.product_profit_margins(product_id,time_spent,time_unit,labour_rate,gst_percent,material_cost,packaging_cost,shipping_cost)
      values(product,90,'minutes',hourly_rate,5,10,10,20)
      on conflict(product_id) do update set time_spent=90,time_unit='minutes',labour_rate=excluded.labour_rate,
        gst_percent=5,material_cost=10,packaging_cost=10,shipping_cost=20;
    insert into public.payment_orders(reference,request_key,created_by,customer_user_id,razorpay_order_id,customer_name,
      customer_contact,customer_email,subtotal_paise,discount_paise,shipping_paise,total_paise,expires_at,
      status,is_live_checkout,delivery_details)
      values('LABOUR-'||gen_random_uuid(),gen_random_uuid(),actor,actor,'order_labour_'||gen_random_uuid(),'Fixture',
        '+919876543210','fixture@example.test',50000,0,0,50000,now()+interval '30 minutes',
        'link_created',true,'{"email":"fixture@example.test"}') returning id into paid_order;
    insert into public.payment_order_items(order_id,product_id,variant_id,product_name,variant_name,image_url,unit_price_paise,quantity)
      values(paid_order,product,gen_random_uuid(),'Synthetic labour fixture','Standard','https://example.test/a.jpg',50000,1);
    update public.payment_orders set status='paid',paid_at=now() where id=paid_order;
    select s.* into ledger from public.seller_sales s join public.payment_order_items i on i.id=s.payment_order_item_id where i.order_id=paid_order;
    if ledger.id is null or ledger.labour_cost is distinct from 1.5*coalesce(hourly_rate,100)
      or ledger.labour_time_spent is distinct from 90 or ledger.labour_time_unit is distinct from 'minutes'
      or ledger.labour_rate is distinct from coalesce(hourly_rate,100) then raise exception 'Website order labour snapshot incorrect: %',row_to_json(ledger); end if;
    if hourly_rate is null then historical_id=ledger.id; end if;
  end loop;
  if not exists(select 1 from public.seller_sales where id=historical_id and labour_cost=150 and labour_rate=100) then
    raise exception 'Product override changed a historical sale.';
  end if;
end $$;
set local role anon;
do $$ begin
  if exists(select 1 from public.seller_sales) then raise exception 'Private labour costs exposed.'; end if;
  if exists(select 1 from public.product_profit_margins) then raise exception 'Private product rates exposed.'; end if;
end $$;
reset role;
rollback;
