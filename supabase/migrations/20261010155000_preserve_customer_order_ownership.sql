alter table public.payment_orders
  add column customer_user_id uuid references auth.users(id) on delete set null;
update public.payment_orders o set customer_user_id = c.user_id
from public.carts c where c.id = o.cart_id;
create index payment_orders_customer_history_idx on public.payment_orders(customer_user_id, created_at desc)
  where not is_test_checkout;

create function public.capture_payment_order_customer()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.cart_id is not null then
    select user_id into new.customer_user_id from public.carts where id = new.cart_id;
  end if;
  return new;
end;
$$;
revoke all on function public.capture_payment_order_customer() from public, anon, authenticated;
create trigger capture_payment_order_customer
before insert or update of cart_id on public.payment_orders
for each row execute function public.capture_payment_order_customer();

create or replace function public.get_customer_orders(page_offset integer default 0)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  customer_id uuid := auth.uid();
  verified_email text;
  orders jsonb;
begin
  select lower(email) into verified_email from auth.users
  where id = customer_id and email_confirmed_at is not null and not coalesce(is_anonymous, false);
  if verified_email is null then raise exception 'Sign in with a verified email to view your orders.'; end if;
  if page_offset is null or page_offset < 0 then raise exception 'Invalid order history page.'; end if;
  select coalesce(jsonb_agg(entry order by created_at desc, id desc), '[]'::jsonb) into orders
  from (
    select o.id, o.created_at, jsonb_build_object(
      'id', o.id, 'reference', o.reference, 'status', o.status, 'createdAt', o.created_at,
      'paidAt', o.paid_at, 'customerName', o.customer_name, 'deliveryPincode', o.delivery_pincode,
      'subtotal', o.subtotal_paise / 100.0, 'discount', o.discount_paise / 100.0,
      'shipping', o.shipping_paise / 100.0, 'total', o.total_paise / 100.0,
      'items', coalesce((select jsonb_agg(jsonb_build_object(
        'id', i.id, 'productName', i.product_name, 'variantName', i.variant_name,
        'quantity', i.quantity, 'unitPrice', i.unit_price_paise / 100.0,
        'lineTotal', i.line_total_paise / 100.0
      ) order by i.id) from public.payment_order_items i where i.order_id = o.id), '[]'::jsonb)
    ) as entry
    from public.payment_orders o
    where not o.is_test_checkout and (
      lower(o.customer_email) = verified_email or o.customer_user_id = customer_id
    )
    order by o.created_at desc, o.id desc limit 20 offset page_offset
  ) history;
  return orders;
end;
$$;
