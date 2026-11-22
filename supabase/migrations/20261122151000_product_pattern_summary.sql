create function public.product_pattern_product_ids()
returns uuid[] language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_catalogue_admin() then raise exception 'Verified admin access required.'; end if;
  return array(select product_id from public.product_patterns order by product_id);
end $$;
revoke all on function public.product_pattern_product_ids() from public, anon;
grant execute on function public.product_pattern_product_ids() to authenticated;
