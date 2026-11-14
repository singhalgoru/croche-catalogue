alter function public.submit_artisan_application(uuid,jsonb,text,text,text,jsonb,jsonb,text)
  rename to submit_artisan_application_before_address_required;
revoke all on function public.submit_artisan_application_before_address_required(uuid,jsonb,text,text,text,jsonb,jsonb,text)
  from public, anon, authenticated;

create function public.submit_artisan_application(request_id uuid, application_details jsonb, privacy_version text, invitation_token text,
  dispatch_terms_version text default null, identity_document jsonb default null, profile_photo jsonb default null,
  applicant_email text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(817265);
  if (jsonb_typeof(application_details->'address') is distinct from 'string'
      or application_details->>'address' ~ '^[[:space:]]*$')
    and not exists (select 1 from public.artisan_applications a where a.id = request_id) then
    raise exception 'Enter a delivery address.';
  end if;
  return public.submit_artisan_application_before_address_required(request_id, application_details, privacy_version,
    invitation_token, dispatch_terms_version, identity_document, profile_photo, applicant_email);
end;
$$;
revoke all on function public.submit_artisan_application(uuid,jsonb,text,text,text,jsonb,jsonb,text) from public, anon;
grant execute on function public.submit_artisan_application(uuid,jsonb,text,text,text,jsonb,jsonb,text) to authenticated;
