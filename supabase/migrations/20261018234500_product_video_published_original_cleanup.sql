-- Originals remain available through preview/reprocessing and failed publication.
create or replace function public.finish_product_video_original_cleanup(p_job_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  update product_video_jobs set original_deleted_at=now()
    where id=p_job_id and status in ('ready','replaced') and original_deleted_at is null;
  return found;
end $$;

create or replace function public.reprocess_product_video(p_job_id uuid,p_music text default 'keep')
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if not public.is_catalogue_admin() then raise exception 'Admin access required'; end if;
  if p_music is null or p_music not in ('keep','brand','none') then raise exception 'Invalid music option.'; end if;
  perform pg_advisory_xact_lock(18130000);
  update product_video_jobs set status='queued',error=null,attempts=0,lease=gen_random_uuid(),
    video_bytes=null,duration_seconds=null,width=null,height=null,updated_at=now(),
    music_source=case p_music when 'keep' then music_source when 'brand' then 'brand' else null end,
    music_bytes=case when p_music='keep' then music_bytes end,
    music_type=case when p_music='keep' then music_type end,
    music_mode=case when p_music='keep' then music_mode end
    where id=p_job_id and product_id is not null and status='review' and not writer_active
      and original_deleted_at is null;
  if not found then raise exception 'Only a private draft awaiting review can be reprocessed.'; end if;
  return true;
end $$;

create function public.dispatch_published_video_original_cleanup()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.request_product_video_processing();
  return new;
end $$;
revoke all on function public.dispatch_published_video_original_cleanup() from public,anon,authenticated;
create trigger dispatch_published_video_original_cleanup
after update of status on public.product_video_jobs
for each row when (new.status='ready' and old.status is distinct from new.status)
execute function public.dispatch_published_video_original_cleanup();
