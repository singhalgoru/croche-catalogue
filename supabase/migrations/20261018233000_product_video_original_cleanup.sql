alter table public.product_video_jobs add column original_deleted_at timestamptz;

-- Processed drafts no longer retain a source suitable for re-encoding.
create or replace function public.reprocess_product_video(p_job_id uuid,p_music text default 'keep')
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if not public.is_catalogue_admin() then raise exception 'Admin access required'; end if;
  raise exception 'Original videos are deleted after processing. Discard the draft and upload again to change music or reprocess.';
end $$;

create function public.finish_product_video_original_cleanup(p_job_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  update product_video_jobs set original_deleted_at=now()
    where id=p_job_id and status in ('review','publishing','ready','replaced')
      and original_deleted_at is null;
  return found;
end $$;
revoke all on function public.finish_product_video_original_cleanup(uuid) from public,anon,authenticated;
grant execute on function public.finish_product_video_original_cleanup(uuid) to service_role;
