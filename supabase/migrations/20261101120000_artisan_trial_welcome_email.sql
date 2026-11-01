alter table public.artisan_application_emails drop constraint if exists artisan_application_emails_kind_check;
alter table public.artisan_application_emails add constraint artisan_application_emails_kind_check
  check(kind in ('submitted','Trial','Approved','Declined','More information required'));

create or replace function public.enqueue_artisan_application_emails()
returns trigger language plpgsql security definer set search_path=''
as $$
declare payload jsonb;
begin
  payload:=jsonb_build_object(
    'application_id',new.id,
    'applicant_name',new.details->>'fullName',
    'applicant_email',new.contact_email,
    'mobile',new.details->>'mobile',
    'city',new.details->>'city',
    'state',new.details->>'state',
    'skills',new.details->>'skills',
    'availability',new.details->>'availability',
    'message',new.applicant_message
  );
  if tg_op='UPDATE' and old.contact_email is distinct from new.contact_email and new.contact_email is not null then
    insert into public.artisan_application_emails(application_id,event_key,kind,recipient_email,payload)
      values(new.id,'submitted','submitted','info@luviacreations.com',payload)
      on conflict(application_id,event_key) do nothing;
  end if;
  -- The trial welcome is sent once per application, even if the status later returns to Trial.
  if tg_op='UPDATE' and old.status is distinct from new.status and new.status='Trial' and new.contact_email is not null then
    insert into public.artisan_application_emails(application_id,event_key,kind,recipient_email,payload)
      values(new.id,'trial-welcome','Trial',new.contact_email,payload)
      on conflict(application_id,event_key) do nothing;
  end if;
  if tg_op='UPDATE' and (old.status is distinct from new.status
      or (new.status='More information required' and old.applicant_message is distinct from new.applicant_message))
    and new.status in ('More information required','Approved','Declined') and new.contact_email is not null then
    insert into public.artisan_application_emails(application_id,event_key,kind,recipient_email,payload)
      values(new.id,'status:'||new.version,new.status,new.contact_email,payload)
      on conflict(application_id,event_key) do nothing;
  end if;
  return new;
end $$;
revoke all on function public.enqueue_artisan_application_emails() from public,anon,authenticated;
