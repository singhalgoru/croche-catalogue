-- Source audio is always removed by the worker. A job may use no music, an
-- admin-uploaded private track (music_source null, legacy metadata) or the
-- private Luvia default track installed at making-video-music/luvia-gentle.wav.
alter table public.product_video_jobs
  add column music_source text check (music_source in ('brand')),
  drop constraint product_video_music_metadata,
  add constraint product_video_music_metadata check (
    (music_source is null and (
      (music_bytes is null and music_type is null and music_mode is null) or
      (music_bytes is not null and music_bytes between 1 and 20971520
        and music_type is not null and music_type in ('audio/mpeg','audio/mp4','audio/wav','audio/x-wav')
        and music_mode is not null and music_mode in ('mix','replace')))) or
    (music_source='brand' and music_bytes is null and music_type is null and music_mode is null)
  );

-- Mode is no longer an admin choice: supplied music always replaces source audio.
-- Legacy 'mix' rows remain valid and are encoded identically by the worker.
create or replace function public.reserve_product_video_with_music(
  p_product_id uuid,p_bytes bigint,p_music_bytes bigint,p_music_type text,
  p_music_mode text,p_music_rights boolean
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if not public.is_catalogue_admin() then raise exception 'Admin access required'; end if;
  if p_music_rights is distinct from true then
    raise exception 'Confirm that you own or have permission to use this music.';
  end if;
  if p_music_bytes is null or p_music_type is null then
    raise exception 'Music metadata is incomplete.';
  end if;
  v_id := public.reserve_product_video(p_product_id,p_bytes);
  update product_video_jobs set music_bytes=p_music_bytes,music_type=p_music_type,music_mode='replace'
    where id=v_id;
  return v_id;
end $$;

create function public.reserve_product_video_with_brand_music(p_product_id uuid,p_bytes bigint)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if not public.is_catalogue_admin() then raise exception 'Admin access required'; end if;
  v_id := public.reserve_product_video(p_product_id,p_bytes);
  update product_video_jobs set music_source='brand' where id=v_id;
  return v_id;
end $$;
revoke all on function public.reserve_product_video_with_brand_music(uuid,bigint) from public,anon;
grant execute on function public.reserve_product_video_with_brand_music(uuid,bigint) to authenticated;

-- Re-encode a private review draft from its retained original without
-- re-upload. p_music: 'keep' (existing choice, incl. a retained supplied
-- track), 'brand' (private default track) or 'none' (no audio stream). The
-- draft returns to the queue, so preview and publication are unavailable until
-- the new encode reaches review. The published video (a different, 'ready'
-- job) is never touched. Retained music.bin stays private until discard.
create function public.reprocess_product_video(p_job_id uuid,p_music text default 'keep')
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
    where id=p_job_id and product_id is not null and status='review' and not writer_active;
  if not found then raise exception 'Only a private draft awaiting review can be reprocessed.'; end if;
  return true;
end $$;
revoke all on function public.reprocess_product_video(uuid,text) from public,anon;
grant execute on function public.reprocess_product_video(uuid,text) to authenticated;
