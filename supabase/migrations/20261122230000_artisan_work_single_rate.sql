create or replace function public.create_artisan_work_assignment_base(request_id uuid, artisan_id uuid, draft jsonb)
returns uuid language plpgsql security definer set search_path=''
as $$
declare
  app public.artisan_applications; existing public.artisan_work_assignments;
  item jsonb; product public.products; pattern public.product_patterns;
  items jsonb := '[]'::jsonb; position integer := 0; attachment_bytes bigint := 0;
  token text; delivery date; quantity integer; item_rates jsonb;
begin
  if not public.is_catalogue_admin() then raise exception 'Verified admin access required.'; end if;
  if request_id is null or artisan_id is null or jsonb_typeof(draft) is distinct from 'object' then
    raise exception 'Invalid assignment request.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(request_id::text,0));
  select * into existing from public.artisan_work_assignments where id=request_id;
  if found then
    if existing.application_id is distinct from artisan_id or existing.actor_id is distinct from auth.uid()
      or existing.request_data is distinct from draft then raise exception 'Assignment request changed. Check the existing assignment before creating another.'; end if;
    return request_id;
  end if;
  if jsonb_typeof(draft->'recipientName') is distinct from 'string' or length(btrim(draft->>'recipientName')) not between 1 and 100
    or jsonb_typeof(draft->'recipientEmail') is distinct from 'string' or length(draft->>'recipientEmail') not between 3 and 254
    or jsonb_typeof(draft->'subject') is distinct from 'string' or length(btrim(draft->>'subject')) not between 1 and 150
    or (draft->>'subject') ~ E'[\\r\\n]'
    or jsonb_typeof(draft->'message') is distinct from 'string' or length(btrim(draft->>'message')) not between 1 and 3000
    or jsonb_typeof(draft->'deliveryDate') is distinct from 'string' or (draft->>'deliveryDate') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or jsonb_typeof(draft->'courierCap') is distinct from 'number' or (draft->>'courierCap') !~ '^[0-9]{1,7}(\.[0-9]{1,2})?$'
    or jsonb_typeof(draft->'items') is distinct from 'array' or jsonb_array_length(draft->'items') not between 1 and 10 then
    raise exception 'Check the assignment subject, message, delivery date, courier cap and products.';
  end if;
  delivery := (draft->>'deliveryDate')::date;
  if delivery < (now() at time zone 'Asia/Kolkata')::date then raise exception 'Delivery date cannot be in the past.'; end if;
  select * into app from public.artisan_applications where id=artisan_id for share;
  if not found or app.status <> 'Approved' or app.contact_email is null then
    raise exception 'Choose an approved artisan with an application email address.';
  end if;
  if app.contact_email is distinct from draft->>'recipientEmail' or app.details->>'fullName' is distinct from draft->>'recipientName' then
    raise exception 'Artisan name or email changed. Reopen the assignment and review the recipient.';
  end if;
  for item in select value from jsonb_array_elements(draft->'items') loop
    position := position + 1;
    if jsonb_typeof(item) is distinct from 'object'
      or jsonb_typeof(item->'name') is distinct from 'string' or length(btrim(item->>'name')) not between 1 and 100
      or jsonb_typeof(item->'quantity') is distinct from 'number' or (item->>'quantity') !~ '^[0-9]{1,5}$'
      or coalesce(jsonb_typeof(item->'productId'),'missing') not in ('string','null')
      or coalesce(jsonb_typeof(item->'patternRevision'),'missing') not in ('string','null') then
      raise exception 'Check product names, quantities and per-unit prices.';
    end if;
    if item ? 'rate' then
      if jsonb_typeof(item->'rate') is distinct from 'number' or (item->>'rate') !~ '^[0-9]{1,7}(\.[0-9]{1,2})?$'
        or item ? 'rateWithYarn' or item ? 'rateWithoutYarn' then
        raise exception 'Check the agreed per-unit price.';
      end if;
      item_rates := jsonb_build_object('rate',(item->>'rate')::numeric);
    else
      if jsonb_typeof(item->'rateWithYarn') is distinct from 'number' or (item->>'rateWithYarn') !~ '^[0-9]{1,7}(\.[0-9]{1,2})?$'
        or jsonb_typeof(item->'rateWithoutYarn') is distinct from 'number' or (item->>'rateWithoutYarn') !~ '^[0-9]{1,7}(\.[0-9]{1,2})?$' then
        raise exception 'Check product names, quantities and per-unit prices.';
      end if;
      item_rates := jsonb_build_object('rateWithYarn',(item->>'rateWithYarn')::numeric,'rateWithoutYarn',(item->>'rateWithoutYarn')::numeric);
    end if;
    quantity := (item->>'quantity')::integer;
    if quantity < 1 then raise exception 'Quantity must be at least one.'; end if;
    pattern := null;
    if item->>'productId' is not null then
      select * into product from public.products where id=(item->>'productId')::uuid for share;
      if not found or product.name is distinct from item->>'name' then raise exception 'A catalogue product changed. Refresh and review the assignment.'; end if;
      if item->>'patternRevision' is not null then
        select * into pattern from public.product_patterns where product_id=product.id and revision=(item->>'patternRevision')::uuid for share;
        if not found then raise exception 'A selected pattern changed or was removed. Refresh and review the assignment.'; end if;
        attachment_bytes := attachment_bytes + octet_length(pattern.pdf_content);
        if attachment_bytes > 8388608 then raise exception 'Selected patterns exceed the 8 MB total attachment limit.'; end if;
      end if;
    elsif item->>'patternRevision' is not null then raise exception 'A manual product cannot have a catalogue pattern.';
    end if;
    items := items || jsonb_build_array(jsonb_build_object('name',btrim(item->>'name'),'quantity',quantity,
      'patternFilename',pattern.pdf_filename) || item_rates);
  end loop;
  token := encode(extensions.gen_random_bytes(32),'hex');
  insert into public.artisan_work_assignments(id,application_id,actor_id,request_data,offer,recipient_email,token_hash,expires_at)
    values(request_id,artisan_id,auth.uid(),draft,jsonb_build_object(
      'recipientName',app.details->>'fullName','reference',request_id::text,'subject',btrim(draft->>'subject'),'message',btrim(draft->>'message'),
      'deliveryDate',delivery::text,'courierCap',(draft->>'courierCap')::numeric,'items',items),
      app.contact_email,encode(extensions.digest(token,'sha256'),'hex'),now()+interval '30 days');
  insert into public.artisan_work_attachments(assignment_id,position,filename,content)
    select request_id, ordinal::integer, p.pdf_filename, p.pdf_content
    from jsonb_array_elements(draft->'items') with ordinality as i(value,ordinal)
    join public.product_patterns p on p.product_id=(i.value->>'productId')::uuid and p.revision=(i.value->>'patternRevision')::uuid
    where i.value->>'patternRevision' is not null;
  insert into public.artisan_work_emails(assignment_id,kind,token) values(request_id,'offer',token);
  return request_id;
end $$;
