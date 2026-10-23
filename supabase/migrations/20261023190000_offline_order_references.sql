create unique index seller_orders_reference_idx on public.seller_orders(reference);

create function public.assign_offline_order_reference(target uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  loop
    begin
      update public.seller_orders
        set reference='LUV-OFFLINE-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))
        where id=target and payment_order_id is null and reference not like 'LUV-OFFLINE-%';
      return;
    exception when unique_violation then
      -- The reference index protects the short random suffix from collisions.
    end;
  end loop;
end $$;
revoke all on function public.assign_offline_order_reference(uuid) from public,anon,authenticated;

create function public.label_offline_sale_order() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.channel='offline' then perform public.assign_offline_order_reference(new.order_id); end if;
  return new;
end $$;
revoke all on function public.label_offline_sale_order() from public,anon,authenticated;
create trigger label_offline_sale_order after insert or update of channel on public.seller_sales
  for each row execute function public.label_offline_sale_order();

do $$
declare target uuid;
begin
  for target in select distinct s.order_id from public.seller_sales s
    join public.seller_orders o on o.id=s.order_id
    where s.channel='offline' and o.payment_order_id is null
  loop
    perform public.assign_offline_order_reference(target);
  end loop;
end $$;
