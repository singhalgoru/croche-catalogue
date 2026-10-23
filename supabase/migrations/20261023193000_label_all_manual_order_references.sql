create or replace function public.label_offline_sale_order() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform public.assign_offline_order_reference(new.order_id);
  return new;
end $$;

do $$
declare target uuid;
begin
  for target in select id from public.seller_orders where payment_order_id is null
  loop
    perform public.assign_offline_order_reference(target);
  end loop;
end $$;
