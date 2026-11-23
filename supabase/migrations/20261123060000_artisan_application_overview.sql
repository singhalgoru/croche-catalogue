create function public.artisan_application_overview()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare result jsonb;
begin
  if not public.is_catalogue_admin() then raise exception 'Verified admin access required.'; end if;
  select jsonb_build_object(
    'total', count(*),
    'counts', jsonb_build_object(
      'New', count(*) filter (where status = 'New'),
      'Contacted', count(*) filter (where status = 'Contacted'),
      'Trial', count(*) filter (where status = 'Trial'),
      'More information required', count(*) filter (where status = 'More information required'),
      'Approved', count(*) filter (where status = 'Approved'),
      'Declined', count(*) filter (where status = 'Declined'),
      'Inactive', count(*) filter (where status = 'Inactive')
    )
  ) into result from public.artisan_applications;
  return result;
end $$;

revoke all on function public.artisan_application_overview() from public, anon, authenticated;
grant execute on function public.artisan_application_overview() to authenticated;
