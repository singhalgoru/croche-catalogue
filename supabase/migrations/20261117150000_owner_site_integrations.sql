create function public.can_update_site_integrations()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_catalogue_admin() and exists (
    select 1 from public.catalogue_admins
    where user_id = auth.uid() and is_owner
  );
$$;

revoke all on function public.can_update_site_integrations() from public, anon;
grant execute on function public.can_update_site_integrations() to authenticated;

create or replace function public.update_site_integrations(
  p_whatsapp_number text,
  p_google_analytics_measurement_id text,
  p_meta_pixel_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_whatsapp text := regexp_replace(coalesce(p_whatsapp_number, ''), '[^0-9]', '', 'g');
  normalized_ga text := upper(btrim(coalesce(p_google_analytics_measurement_id, '')));
  normalized_pixel text := btrim(coalesce(p_meta_pixel_id, ''));
begin
  if not public.can_update_site_integrations() then
    raise exception 'Only the site owner with verified admin access can update site integrations.'
      using errcode = '42501';
  end if;
  if normalized_whatsapp !~ '^[0-9]{8,15}$' then
    raise exception 'Enter a WhatsApp number with 8 to 15 digits, including its country code.';
  end if;
  if normalized_ga <> '' and normalized_ga !~ '^G-[A-Z0-9]{4,20}$' then
    raise exception 'Enter a valid GA4 measurement ID such as G-XXXXXXXXXX, or leave it blank to disable GA4.';
  end if;
  if normalized_pixel <> '' and normalized_pixel !~ '^[0-9]{5,30}$' then
    raise exception 'Enter a numeric Meta Pixel ID, or leave it blank to disable Meta Pixel tracking.';
  end if;

  update public.site_integrations
  set whatsapp_number = normalized_whatsapp,
      google_analytics_measurement_id = normalized_ga,
      meta_pixel_id = normalized_pixel,
      updated_at = now()
  where id;

  if not found then
    raise exception 'Site integration settings are not initialized.';
  end if;

  return true;
end;
$$;

revoke all on function public.update_site_integrations(text, text, text) from public, anon;
grant execute on function public.update_site_integrations(text, text, text) to authenticated;
