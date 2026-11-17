create table public.site_integrations (
  id boolean primary key default true check (id),
  whatsapp_number text,
  google_analytics_measurement_id text,
  meta_pixel_id text,
  updated_at timestamptz not null default now()
);

insert into public.site_integrations (id) values (true);

alter table public.site_integrations enable row level security;
revoke all on public.site_integrations from public, anon, authenticated;
grant select (id, whatsapp_number, google_analytics_measurement_id, meta_pixel_id)
on public.site_integrations to anon, authenticated;
grant all on public.site_integrations to service_role;

create policy site_integrations_public_read
on public.site_integrations for select
using (true);

create trigger audit_site_integration_changes
after insert or update or delete on public.site_integrations
for each row execute function public.audit_catalogue_change();

create trigger request_site_rebuild
after update on public.site_integrations
for each statement execute function public.request_site_rebuild();

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
  if not public.is_catalogue_admin() then
    raise exception 'Verified catalogue admin access is required.';
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
