-- Published metadata is separate from private, admin-only staging jobs.
create table public.product_making_videos (
  product_id uuid primary key references public.products(id) on delete cascade,
  job_id uuid not null unique,
  video_url text not null check (video_url ~ '^https://'),
  poster_url text not null check (poster_url ~ '^https://'),
  duration_seconds numeric not null check (duration_seconds > 0 and duration_seconds <= 60),
  width integer not null check (width between 2 and 1280),
  height integer not null check (height between 2 and 720)
);
create table public.product_video_jobs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete set null,
  status text not null default 'uploading' check (status in
    ('uploading','receiving','queued','processing','review','publishing','ready','failed','discarding','cancelled','replaced')),
  source_bytes bigint not null check (source_bytes between 1 and 62914560),
  error text,
  lease uuid,
  writer_active boolean not null default false,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  duration_seconds numeric check (duration_seconds > 0 and duration_seconds <= 60),
  width integer check (width between 2 and 1280),
  height integer check (height between 2 and 720),
  video_bytes bigint check (video_bytes between 1 and 41943040)
);
create unique index product_video_one_active_job on public.product_video_jobs(product_id)
  where status in ('uploading','receiving','queued','processing','review','publishing','discarding');
create index product_video_job_queue on public.product_video_jobs(status,created_at);
alter table public.product_making_videos enable row level security;
alter table public.product_video_jobs enable row level security;
revoke all on public.product_making_videos, public.product_video_jobs from anon,authenticated;
grant select on public.product_making_videos to anon,authenticated;
grant select on public.product_video_jobs to authenticated;
create policy "Published making videos" on public.product_making_videos for select
  using (exists(select 1 from public.products p where p.id=product_id and p.published));
create policy "Admins inspect making videos" on public.product_making_videos for select to authenticated
  using (public.is_catalogue_admin());
create policy "Admins inspect video jobs" on public.product_video_jobs for select to authenticated
  using (public.is_catalogue_admin());
grant all on public.product_video_jobs,public.product_making_videos to service_role;

create function public.reserve_product_video(p_product_id uuid,p_bytes bigint)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if not public.is_catalogue_admin() then raise exception 'Admin access required'; end if;
  perform pg_advisory_xact_lock(18130000);
  if not exists(select 1 from products where id=p_product_id) then raise exception 'Product not found'; end if;
  if (select count(*) from product_video_jobs where status in
    ('uploading','receiving','queued','processing','review','publishing','discarding')) >= 20 then
    raise exception 'Video queue is full. Publish or discard existing drafts first.';
  end if;
  insert into product_video_jobs(product_id,source_bytes) values(p_product_id,p_bytes) returning id into v_id;
  return v_id;
exception when unique_violation then raise exception 'This product already has a video draft. Publish or discard it first.';
end $$;

create function public.begin_product_video_upload(p_job_id uuid)
returns setof public.product_video_jobs language plpgsql security definer set search_path=public as $$
begin
  if not public.is_catalogue_admin() then raise exception 'Admin access required'; end if;
  return query update product_video_jobs set status='receiving',lease=gen_random_uuid(),
    writer_active=true,updated_at=now() where id=p_job_id and status='uploading' returning *;
  if not found then raise exception 'Upload is unavailable or was discarded.'; end if;
end $$;

create function public.finish_product_video_upload(p_job_id uuid,p_lease uuid,p_error text default null)
returns boolean language plpgsql security definer set search_path=public as $$
declare j public.product_video_jobs;
begin
  select * into j from product_video_jobs where id=p_job_id and lease=p_lease for update;
  if j.id is null then return false; end if;
  update product_video_jobs set writer_active=false where id=j.id;
  if j.status <> 'receiving' then return false; end if;
  update product_video_jobs set status=case when p_error is null then 'queued' else 'failed' end,
    error=left(p_error,500),updated_at=now() where id=j.id;
  return p_error is null;
end $$;

create function public.remove_product_video(p_product_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_catalogue_admin() then raise exception 'Admin access required'; end if;
  perform pg_advisory_xact_lock(18130000);
  update product_video_jobs set status='replaced',updated_at=now() where product_id=p_product_id and status='ready';
  delete from product_making_videos where product_id=p_product_id;
  update products set updated_at=now() where id=p_product_id;
end $$;

create function public.discard_product_video(p_product_id uuid)
returns setof public.product_video_jobs language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if not public.is_catalogue_admin() then raise exception 'Admin access required'; end if;
  perform pg_advisory_xact_lock(18130000);
  select id into v_id from product_video_jobs where product_id=p_product_id
    and status not in ('ready','replaced','cancelled') order by created_at desc limit 1 for update;
  -- The tombstone fences all upload/processing/publication completion RPCs.
  return query update product_video_jobs set status='discarding',error=null,
    updated_at=case when status='discarding' then updated_at else now() end
    where id=v_id returning *;
end $$;

create function public.finish_product_video_discard(p_job_id uuid,p_error text default null)
returns boolean language plpgsql security definer set search_path=public as $$
declare j public.product_video_jobs;
begin
  select * into j from product_video_jobs where id=p_job_id and status='discarding' for update;
  if j.id is null then return false; end if;
  if p_error is not null then
    update product_video_jobs set error=left(p_error,500) where id=j.id;
    return false;
  end if;
  if j.writer_active then return false; end if;
  update product_video_jobs set status='cancelled',error=null,updated_at=now() where id=j.id;
  return true;
end $$;

create function public.claim_product_video()
returns setof public.product_video_jobs language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  -- Recover interrupted bounded writers; never delete retained assets automatically.
  update product_video_jobs set writer_active=false
    where status='discarding' and writer_active and updated_at<now()-interval '15 minutes';
  update product_video_jobs set status='review',writer_active=false,
    error='Publication was interrupted. Preview and publish again.',updated_at=now()
    where status='publishing' and updated_at<now()-interval '15 minutes';
  update product_video_jobs set status='failed',writer_active=false,
    error='Upload expired. Discard the draft and upload again.',updated_at=now()
    where status in ('uploading','receiving') and updated_at<now()-interval '20 minutes';
  update product_video_jobs set status='failed',writer_active=false,
    error='Processing timed out. Discard the draft and upload again.',updated_at=now()
    where status='processing' and updated_at<now()-interval '15 minutes' and attempts>=3;
  update product_video_jobs set status='failed',error='Product was deleted. Files are retained.',updated_at=now()
    where product_id is null and not writer_active and status in ('uploading','queued','processing','review','publishing');
  select id into v_id from product_video_jobs where product_id is not null and
    (status='queued' or (status='processing' and updated_at<now()-interval '15 minutes' and attempts<3))
    order by created_at for update skip locked limit 1;
  return query update product_video_jobs set status='processing',lease=gen_random_uuid(),
    writer_active=true,attempts=attempts+1,updated_at=now() where id=v_id returning *;
end $$;

create function public.finish_product_video(
  p_job_id uuid,p_lease uuid,p_video_bytes bigint,p_duration numeric,p_width integer,p_height integer,p_error text default null
) returns boolean language plpgsql security definer set search_path=public as $$
declare j public.product_video_jobs;
begin
  select * into j from product_video_jobs where id=p_job_id and lease=p_lease for update;
  if j.id is null then return false; end if;
  update product_video_jobs set writer_active=false where id=j.id;
  if j.status <> 'processing' then return false; end if;
  if j.product_id is null then
    update product_video_jobs set status='failed',error='Product was deleted. Files are retained.',updated_at=now() where id=j.id;
    return false;
  end if;
  if p_error is not null then
    update product_video_jobs set status='failed',error=left(p_error,500),updated_at=now() where id=j.id;
    return false;
  end if;
  if p_video_bytes is null or p_duration is null or p_width is null or p_height is null then
    raise exception 'Processed video metadata is incomplete.';
  end if;
  update product_video_jobs set status='review',error=null,updated_at=now(),video_bytes=p_video_bytes,
    duration_seconds=p_duration,width=p_width,height=p_height where id=j.id;
  return true;
end $$;

create function public.begin_product_video_publish(p_job_id uuid)
returns setof public.product_video_jobs language plpgsql security definer set search_path=public as $$
begin
  if not public.is_catalogue_admin() then raise exception 'Admin access required'; end if;
  perform pg_advisory_xact_lock(18130000);
  return query update product_video_jobs set status='publishing',lease=gen_random_uuid(),
    writer_active=true,error=null,updated_at=now() where id=p_job_id and product_id is not null and status='review' returning *;
  if not found then raise exception 'Video is not ready for publication, or publication is already in progress.'; end if;
end $$;

create function public.finish_product_video_publish(
  p_job_id uuid,p_lease uuid,p_video_url text,p_poster_url text,p_error text default null
) returns boolean language plpgsql security definer set search_path=public as $$
declare j public.product_video_jobs;
begin
  perform pg_advisory_xact_lock(18130000);
  select * into j from product_video_jobs where id=p_job_id and lease=p_lease for update;
  if j.id is null then return false; end if;
  update product_video_jobs set writer_active=false where id=j.id;
  if j.status <> 'publishing' or j.product_id is null then return false; end if;
  if p_error is not null then
    update product_video_jobs set status='review',error=left(p_error,500),updated_at=now() where id=j.id;
    return false;
  end if;
  if j.video_bytes is null or j.duration_seconds is null or j.width is null or j.height is null then
    raise exception 'Processed video metadata is incomplete.';
  end if;
  update product_video_jobs set status='replaced',updated_at=now() where product_id=j.product_id and status='ready';
  insert into product_making_videos values(j.product_id,j.id,p_video_url,p_poster_url,j.duration_seconds,j.width,j.height)
    on conflict(product_id) do update set job_id=excluded.job_id,video_url=excluded.video_url,
      poster_url=excluded.poster_url,duration_seconds=excluded.duration_seconds,width=excluded.width,height=excluded.height;
  update product_video_jobs set status='ready',error=null,updated_at=now() where id=j.id;
  update products set updated_at=now() where id=j.product_id;
  return true;
end $$;

-- PostgREST RPCs default to PUBLIC execute: restrict every mutation explicitly.
revoke all on function public.reserve_product_video(uuid,bigint),public.begin_product_video_upload(uuid),
  public.remove_product_video(uuid),public.discard_product_video(uuid),public.begin_product_video_publish(uuid) from public,anon;
grant execute on function public.reserve_product_video(uuid,bigint),public.begin_product_video_upload(uuid),
  public.remove_product_video(uuid),public.discard_product_video(uuid),public.begin_product_video_publish(uuid) to authenticated;
revoke all on function public.claim_product_video(),public.finish_product_video_upload(uuid,uuid,text),
  public.finish_product_video(uuid,uuid,bigint,numeric,integer,integer,text),
  public.finish_product_video_publish(uuid,uuid,text,text,text),public.finish_product_video_discard(uuid,text)
  from public,anon,authenticated;
grant execute on function public.claim_product_video(),public.finish_product_video_upload(uuid,uuid,text),
  public.finish_product_video(uuid,uuid,bigint,numeric,integer,integer,text),
  public.finish_product_video_publish(uuid,uuid,text,text,text),public.finish_product_video_discard(uuid,text) to service_role;
