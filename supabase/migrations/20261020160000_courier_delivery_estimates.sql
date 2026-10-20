alter table public.order_shipping
  add column estimated_delivery_date date;

create function public.with_courier_delivery_estimate(entries jsonb)
returns jsonb language sql security definer set search_path=''
as $$
  select coalesce(jsonb_agg(case when jsonb_typeof(entry->'fulfilment')='object'
    then jsonb_set(entry,'{fulfilment}',(entry->'fulfilment')||jsonb_build_object(
      'deliveryEstimate',case when s.awb is not null
        and (o.tracking_number='' or o.tracking_number=s.awb)
      then jsonb_build_object(
        'courierName',s.courier_name,
        'transitDays',(select q->'days' from jsonb_array_elements(s.quotes) q
          where (q->>'id')::bigint=s.courier_id limit 1),
        'expectedDate',s.estimated_delivery_date,
        'updatedAt',coalesce(s.synced_at,s.updated_at))
      else null end))
    else entry end order by position),'[]'::jsonb)
  from jsonb_array_elements(entries) with ordinality as items(entry,position)
  join public.payment_orders o on o.id=(entry->>'id')::uuid
  left join public.order_shipping s on s.order_id=o.id;
$$;
revoke all on function public.with_courier_delivery_estimate(jsonb) from public,anon,authenticated;

alter function public.get_admin_live_orders(integer) rename to get_admin_live_orders_before_courier_estimates;
revoke all on function public.get_admin_live_orders_before_courier_estimates(integer) from public,anon,authenticated;
create function public.get_admin_live_orders(page_offset integer default 0)
returns jsonb language sql security definer set search_path=''
as $$ select public.with_courier_delivery_estimate(public.get_admin_live_orders_before_courier_estimates(page_offset)); $$;
revoke all on function public.get_admin_live_orders(integer) from public,anon;
grant execute on function public.get_admin_live_orders(integer) to authenticated;

alter function public.get_customer_orders(integer,boolean) rename to get_customer_orders_before_courier_estimates;
revoke all on function public.get_customer_orders_before_courier_estimates(integer,boolean) from public,anon,authenticated;
create function public.get_customer_orders(page_offset integer default 0,hidden_orders boolean default false)
returns jsonb language sql security definer set search_path=''
as $$ select public.with_courier_delivery_estimate(
  public.get_customer_orders_before_courier_estimates(page_offset,hidden_orders)); $$;
revoke all on function public.get_customer_orders(integer,boolean) from public,anon;
grant execute on function public.get_customer_orders(integer,boolean) to authenticated;
