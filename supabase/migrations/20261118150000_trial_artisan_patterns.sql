create or replace function public.product_pattern_workspace(target_product uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
begin
  if not public.is_catalogue_admin() then raise exception 'Verified admin access required.'; end if;
  if not exists(select 1 from public.products where id=target_product) then raise exception 'Product not found.'; end if;
  return jsonb_build_object(
    'pattern',(select jsonb_build_object('revision',revision,'filename',filename,'updated_at',updated_at,
      'size',octet_length(content),'pdf_filename',pdf_filename,'pdf_size',octet_length(pdf_content),'language',language)
      from public.product_patterns where product_id=target_product),
    'recipients',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',details->>'fullName','email',contact_email)
      order by details->>'fullName',id) from public.artisan_applications
      where status in ('Trial','Approved') and contact_email is not null),'[]'::jsonb),
    'emails',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc) from (
      select id,recipient_email,filename,created_at,accepted_at,attempts,last_error
      from public.product_pattern_emails where product_id=target_product order by created_at desc limit 20
    ) e),'[]'::jsonb)
  );
end $$;

create or replace function public.queue_product_pattern_email(target_product uuid, expected_revision uuid, artisan_id uuid, request_id uuid, artisan_message text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare pattern public.product_patterns; artisan public.artisan_applications; product_name text; existing public.product_pattern_emails;
begin
  if not public.is_catalogue_admin() then raise exception 'Verified admin access required.'; end if;
  if request_id is null or artisan_message is null or length(artisan_message)>1500 then raise exception 'Check the sharing request and message (up to 1,500 characters).'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(request_id::text,0));
  select * into existing from public.product_pattern_emails where id=request_id;
  if found then
    if existing.product_id is distinct from target_product or existing.revision is distinct from expected_revision
      or existing.application_id is distinct from artisan_id or existing.message<>btrim(artisan_message) then
      raise exception 'Email request changed. Refresh before sharing again.';
    end if;
    return request_id;
  end if;
  if (select count(*) from public.product_pattern_emails where actor_id=auth.uid() and created_at>now()-interval '1 day')>=100 then
    raise exception 'Daily pattern email limit reached.';
  end if;
  select name into product_name from public.products where id=target_product for share;
  if not found then raise exception 'Product not found.'; end if;
  select * into pattern from public.product_patterns where product_id=target_product and revision=expected_revision;
  if not found then raise exception 'Pattern changed or was removed. Refresh before sharing.'; end if;
  select * into artisan from public.artisan_applications where id=artisan_id for share;
  if not found or artisan.status not in ('Trial','Approved') or artisan.contact_email is null then
    raise exception 'Choose a Trial or Approved artisan with an application email address.';
  end if;
  insert into public.product_pattern_emails(id,product_id,application_id,revision,product_name,
    recipient_name,recipient_email,filename,content,language,message,actor_id)
  values(request_id,target_product,artisan_id,expected_revision,product_name,
    artisan.details->>'fullName',artisan.contact_email,pattern.pdf_filename,pattern.pdf_content,pattern.language,btrim(artisan_message),auth.uid());
  return request_id;
end $$;

create or replace function public.claim_product_pattern_emails()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare result jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Backend access required.'; end if;
  update public.product_pattern_emails set attempts=8,last_error='Retry window expired. Check provider delivery before any new send.'
    where accepted_at is null and attempts<8 and first_attempt_at<now()-interval '23 hours';
  update public.product_pattern_emails e set attempts=8,last_error='Cancelled: artisan is no longer Trial or Approved, or email changed.',content=null
    where accepted_at is null and attempts<8 and not exists(
      select 1 from public.artisan_applications a where a.id=e.application_id and a.status in ('Trial','Approved') and a.contact_email=e.recipient_email);
  with due as (
    select id from public.product_pattern_emails where accepted_at is null and attempts<8
      and next_attempt_at<=now() order by next_attempt_at for update skip locked limit 3
  ), claimed as (
    update public.product_pattern_emails e set attempts=e.attempts+1,first_attempt_at=coalesce(e.first_attempt_at,now()),
      next_attempt_at=now()+interval '15 minutes'
    from due where e.id=due.id returning e.*
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'recipient_name',recipient_name,'recipient_email',recipient_email,
    'product_name',product_name,'filename',filename,'message',message,'language',language,
    'data',replace(encode(content,'base64'),E'\n',''))),'[]'::jsonb) into result from claimed;
  return result;
end $$;
