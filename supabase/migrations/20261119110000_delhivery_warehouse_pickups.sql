create table public.delhivery_warehouse_pickups (
  id uuid primary key,
  warehouse text not null,
  pickup_date date not null,
  pickup_time time not null,
  package_count integer not null check (package_count between 1 and 10000),
  state text not null check (state in ('pending','confirmed','review')),
  pickup_id text,
  last_error text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id)
);
create unique index delhivery_one_open_pickup_per_warehouse
  on public.delhivery_warehouse_pickups (warehouse) where resolved_at is null;
alter table public.delhivery_warehouse_pickups enable row level security;
revoke all on public.delhivery_warehouse_pickups from public,anon,authenticated;
grant all on public.delhivery_warehouse_pickups to service_role;

create function public.claim_delhivery_pickup(p_id uuid, p_order_id uuid, p_warehouse text,
  p_date date, p_time time, p_count integer, p_actor uuid)
returns void language plpgsql security definer set search_path=''
as $$
begin
  if p_id is null or p_actor is null or p_warehouse is null or length(trim(p_warehouse))=0
    or p_date is null or p_time is null or p_count is null or p_count not between 1 and 10000
    or (p_date + p_time) at time zone 'Asia/Kolkata' <= now() then
    raise exception 'Enter a future pickup date and time and a valid package count.';
  end if;
  if not exists (
    select 1 from public.order_shipping s join public.payment_orders o on o.id=s.order_id
    where s.order_id=p_order_id and s.provider='delhivery' and s.awb is not null
      and not s.review_required and s.operation is null and o.status='paid'
      and o.is_live_checkout and not o.is_test_checkout
      and o.fulfilment_status in ('confirmed','processing')
  ) then raise exception 'A booked, unshipped Delhivery shipment is required.'; end if;
  begin
    insert into public.delhivery_warehouse_pickups(id,warehouse,pickup_date,pickup_time,package_count,state,created_by)
      values(p_id,p_warehouse,p_date,p_time,p_count,'pending',p_actor);
  exception when unique_violation then
    raise exception 'This warehouse already has an open pickup request. Refresh shipping status.';
  end;
end $$;
revoke all on function public.claim_delhivery_pickup(uuid,uuid,text,date,time,integer,uuid) from public,anon,authenticated;
grant execute on function public.claim_delhivery_pickup(uuid,uuid,text,date,time,integer,uuid) to service_role;

create function public.resolve_delhivery_pickup(p_id uuid, p_warehouse text, p_actor uuid)
returns void language plpgsql security definer set search_path=''
as $$
begin
  if p_actor is null then raise exception 'Admin identity required.'; end if;
  update public.delhivery_warehouse_pickups set resolved_at=now(),resolved_by=p_actor
    where id=p_id and warehouse=p_warehouse and resolved_at is null
      and (state <> 'pending' or created_at < now()-interval '5 minutes');
  if not found then raise exception 'Pickup changed or is still running. Refresh and check Delhivery before retrying.'; end if;
end $$;
revoke all on function public.resolve_delhivery_pickup(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.resolve_delhivery_pickup(uuid,text,uuid) to service_role;
