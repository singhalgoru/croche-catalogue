alter table public.product_video_jobs
  add column public_asset_name text check (public_asset_name ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  add column assets_deleted_at timestamptz;

create or replace function public.begin_product_video_publish(p_job_id uuid)
returns setof public.product_video_jobs language plpgsql security definer set search_path=public as $$
begin
  if not public.is_catalogue_admin() then raise exception 'Admin access required'; end if;
  perform pg_advisory_xact_lock(18130000);
  return query update product_video_jobs j set status='publishing',lease=gen_random_uuid(),
    public_asset_name=coalesce(j.public_asset_name,
      nullif(trim(both '-' from regexp_replace(lower(left(p.name,100)), '[^a-z0-9]+', '-', 'g')), ''),
      'product-' || replace(p.id::text, '-', '')),
    writer_active=true,error=null,updated_at=now()
    from products p where j.id=p_job_id and p.id=j.product_id and j.status='review' returning j.*;
  if not found then raise exception 'Video is not ready for publication, or publication is already in progress.'; end if;
end $$;

create function public.finish_replaced_product_video_cleanup(p_job_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  update product_video_jobs j set assets_deleted_at=now(),
    original_deleted_at=coalesce(original_deleted_at,now()),error=null
    where j.id=p_job_id and j.status='replaced' and not j.writer_active
      and not exists(select 1 from product_making_videos v where v.job_id=j.id);
  return found;
end $$;
revoke all on function public.finish_replaced_product_video_cleanup(uuid) from public,anon,authenticated;
grant execute on function public.finish_replaced_product_video_cleanup(uuid) to service_role;

create trigger dispatch_replaced_video_cleanup
after update of status on public.product_video_jobs
for each row when (new.status='replaced' and old.status is distinct from new.status)
execute function public.dispatch_published_video_original_cleanup();
