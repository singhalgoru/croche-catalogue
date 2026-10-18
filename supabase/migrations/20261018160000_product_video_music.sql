-- Music is private source material, retained with the video until explicit discard.
alter table public.product_video_jobs
  add column music_bytes bigint,
  add column music_type text,
  add column music_mode text,
  add constraint product_video_music_metadata check (
    (music_bytes is null and music_type is null and music_mode is null) or
    (music_bytes is not null and music_bytes between 1 and 20971520
      and music_type is not null and music_type in ('audio/mpeg','audio/mp4','audio/wav','audio/x-wav')
      and music_mode is not null and music_mode in ('mix','replace'))
  );

-- Keep the existing two-argument RPC (and its queue locking/permissions) intact.
create function public.reserve_product_video_with_music(
  p_product_id uuid,p_bytes bigint,p_music_bytes bigint,p_music_type text,
  p_music_mode text,p_music_rights boolean
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if not public.is_catalogue_admin() then raise exception 'Admin access required'; end if;
  if p_music_rights is distinct from true then
    raise exception 'Confirm that you own or have permission to use this music.';
  end if;
  if p_music_bytes is null or p_music_type is null or p_music_mode is null then
    raise exception 'Music metadata is incomplete.';
  end if;
  v_id := public.reserve_product_video(p_product_id,p_bytes);
  update product_video_jobs set music_bytes=p_music_bytes,music_type=p_music_type,music_mode=p_music_mode
    where id=v_id;
  return v_id;
end $$;
revoke all on function public.reserve_product_video_with_music(uuid,bigint,bigint,text,text,boolean) from public,anon;
grant execute on function public.reserve_product_video_with_music(uuid,bigint,bigint,text,text,boolean) to authenticated;
