create or replace function public.get_catalogue_bestsellers()
returns table (product_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select s.product_id
  from public.seller_sales s
  join public.products p on p.id = s.product_id
  where p.published
    and exists (
      select 1 from public.product_variants v
      where v.product_id = p.id and v.in_stock and v.available_quantity > 0
    )
    and s.sale_date <= current_date
  group by s.product_id
  having sum(s.quantity) filter (where s.sale_date >= current_date - 89) > 0
  order by sum(s.quantity) filter (where s.sale_date >= current_date - 89) desc,
    sum(s.quantity) desc, s.product_id
  limit 4;
$$;

revoke all on function public.get_catalogue_bestsellers() from public;
grant execute on function public.get_catalogue_bestsellers() to anon, authenticated;
