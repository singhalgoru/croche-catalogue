-- Originals travel through bounded authenticated requests; only the edge can
-- complete an R2 multipart upload. No browser PUT URL can outlive a discard.
alter table public.product_video_jobs
  drop constraint product_video_jobs_source_bytes_check,
  add constraint product_video_jobs_source_bytes_check check (source_bytes between 1 and 524288000),
  add column original_upload_id text,
  add column original_parts jsonb not null default '[]'::jsonb,
  add column music_uploaded boolean not null default false;

create function public.claim_product_video_transfer(p_job_id uuid,p_operation text,p_part integer default null)
returns setof public.product_video_jobs language plpgsql security definer set search_path=public as $$
declare j public.product_video_jobs;
begin
  if not public.is_catalogue_admin() then raise exception 'Admin access required'; end if;
  select * into j from product_video_jobs where id=p_job_id for update;
  if j.id is null or j.status <> 'receiving' or j.writer_active
    or j.original_upload_id is null or j.updated_at < now()-interval '20 minutes' then
    raise exception 'Upload is unavailable, expired or was discarded. Discard the draft and retry.';
  end if;
  if p_operation='part' then
    if p_part is null or p_part <> jsonb_array_length(j.original_parts)+1
      or p_part > ceil(j.source_bytes::numeric/8388608) then
      raise exception 'Unexpected video upload part.';
    end if;
  elsif p_operation='music' then
    if j.music_bytes is null or j.music_uploaded then raise exception 'Music upload is unavailable.'; end if;
  elsif p_operation='complete' then
    if jsonb_array_length(j.original_parts) <> ceil(j.source_bytes::numeric/8388608)
      or (j.music_bytes is not null and not j.music_uploaded) then
      raise exception 'Upload is incomplete.';
    end if;
  else
    raise exception 'Invalid upload operation.';
  end if;
  return query update product_video_jobs set writer_active=true,lease=gen_random_uuid(),updated_at=now()
    where id=j.id returning *;
end $$;

create function public.finish_product_video_transfer(
  p_job_id uuid,p_lease uuid,p_operation text,p_upload_id text default null,
  p_etag text default null,p_error text default null
) returns boolean language plpgsql security definer set search_path=public as $$
declare j public.product_video_jobs;
begin
  select * into j from product_video_jobs where id=p_job_id and lease=p_lease and writer_active for update;
  if j.id is null then return false; end if;
  -- Persist even when discard raced initiation, so cleanup can abort the exact MPU.
  if p_operation='start' and p_upload_id is not null then
    update product_video_jobs set original_upload_id=p_upload_id where id=j.id;
  end if;
  update product_video_jobs set writer_active=false,updated_at=now() where id=j.id;
  if j.status <> 'receiving' then return false; end if;
  if p_error is not null then
    update product_video_jobs set status='failed',error=left(p_error,500) where id=j.id;
    return false;
  end if;
  if p_operation='part' then
    if p_etag is null or length(p_etag) > 200 then raise exception 'Missing part ETag'; end if;
    update product_video_jobs set original_parts=original_parts || jsonb_build_array(p_etag) where id=j.id;
  elsif p_operation='music' then
    update product_video_jobs set music_uploaded=true where id=j.id;
  elsif p_operation <> 'start' or p_upload_id is null then
    raise exception 'Invalid upload completion.';
  end if;
  return true;
end $$;

revoke all on function public.claim_product_video_transfer(uuid,text,integer) from public,anon;
grant execute on function public.claim_product_video_transfer(uuid,text,integer) to authenticated;
revoke all on function public.finish_product_video_transfer(uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.finish_product_video_transfer(uuid,uuid,text,text,text,text) to service_role;
