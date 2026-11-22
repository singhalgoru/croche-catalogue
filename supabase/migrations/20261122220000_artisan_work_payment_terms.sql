-- Keep the existing creation logic and its idempotency checks, but require and
-- snapshot the new terms for newly created assignments.
alter function public.create_artisan_work_assignment(uuid,uuid,jsonb) rename to create_artisan_work_assignment_base;
revoke all on function public.create_artisan_work_assignment_base(uuid,uuid,jsonb) from public, anon, authenticated;

create function public.create_artisan_work_assignment(request_id uuid, artisan_id uuid, draft jsonb)
returns uuid language plpgsql security definer set search_path=''
as $$
declare
  item jsonb;
  snapshot_items jsonb;
  terms constant text := 'Delivered products must meet the quality standards agreed before work begins. Products that do not meet those standards may be rejected and will be returned after the advance payment is returned. Luvia will bear the return shipment courier charges.';
begin
  if not public.is_catalogue_admin() then raise exception 'Verified admin access required.'; end if;
  if request_id is null or artisan_id is null or jsonb_typeof(draft) is distinct from 'object' then
    raise exception 'Invalid assignment request.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(request_id::text,0));
  if exists (select 1 from public.artisan_work_assignments where id=request_id) then
    return public.create_artisan_work_assignment_base(request_id,artisan_id,draft);
  end if;
  if jsonb_typeof(draft->'advancePercent') is distinct from 'number'
    or (draft->>'advancePercent') !~ '^[0-9]{1,3}(\.[0-9]{1,2})?$'
    or (draft->>'advancePercent')::numeric > 100 then
    raise exception 'Advance percentage must be between 0 and 100 with at most two decimal places.';
  end if;
  if jsonb_typeof(draft->'items') is distinct from 'array' then
    raise exception 'Check assignment products.';
  end if;
  for item in select value from jsonb_array_elements(draft->'items') loop
    if jsonb_typeof(item->'yarnBasis') is distinct from 'string' or item->>'yarnBasis' not in ('with','without') then
      raise exception 'Select the agreed yarn rate for every product.';
    end if;
  end loop;
  perform public.create_artisan_work_assignment_base(request_id,artisan_id,draft);
  select jsonb_agg(snapshot.value || jsonb_build_object('yarnBasis',source.value->>'yarnBasis') order by snapshot.ordinal)
    into snapshot_items
    from public.artisan_work_assignments a
    cross join lateral jsonb_array_elements(a.offer->'items') with ordinality as snapshot(value,ordinal)
    join lateral jsonb_array_elements(draft->'items') with ordinality as source(value,ordinal) on source.ordinal=snapshot.ordinal
    where a.id=request_id;
  update public.artisan_work_assignments
    set offer = offer || jsonb_build_object('advancePercent',(draft->>'advancePercent')::numeric,
      'qualityTerms',terms,'items',snapshot_items)
    where id=request_id;
  return request_id;
end $$;
revoke all on function public.create_artisan_work_assignment(uuid,uuid,jsonb) from public, anon;
grant execute on function public.create_artisan_work_assignment(uuid,uuid,jsonb) to authenticated;
