alter table public.cart_items add column product_public_slug text;

update public.cart_items as cart_item
set product_public_slug = product.public_slug
from public.products as product
where product.id::text = cart_item.product_id;
