-- Rollback-only integration checks. Use a migrated TEST database, never production.
begin;
create temporary table video_fixture as select gen_random_uuid() admin_id,
  gen_random_uuid() session_id,gen_random_uuid() factor_id,
  (select p.id from public.products p where p.published and not exists(
    select 1 from public.product_video_jobs j where j.product_id=p.id) limit 1) product_id;
grant select on video_fixture to anon,authenticated,service_role;
insert into auth.users(id) select admin_id from video_fixture;
insert into public.catalogue_admins(user_id) select admin_id from video_fixture;
insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at,secret)
select factor_id,admin_id,'totp','verified',now(),now(),'fixture' from video_fixture;
insert into auth.sessions(id,user_id,factor_id,aal,created_at,updated_at)
select session_id,admin_id,factor_id,'aal2',now(),now() from video_fixture;
do $$ begin
  if has_table_privilege('anon','public.product_video_jobs','SELECT')
    or has_table_privilege('authenticated','public.product_making_videos','UPDATE')
    or has_table_privilege('authenticated','public.product_making_videos','INSERT')
    or has_table_privilege('authenticated','public.product_making_videos','DELETE') then
    raise exception 'FAIL: direct media permissions';
  end if;
  if has_function_privilege('authenticated','public.claim_product_video()','EXECUTE')
    or has_function_privilege('anon','public.reserve_product_video(uuid,bigint)','EXECUTE')
    or has_function_privilege('authenticated','public.finish_product_video(uuid,uuid,bigint,numeric,integer,integer,text)','EXECUTE')
    or has_function_privilege('authenticated','public.finish_product_video_publish(uuid,uuid,text,text,text)','EXECUTE')
    or has_function_privilege('authenticated','public.finish_product_video_discard(uuid,text)','EXECUTE') then
    raise exception 'FAIL: restricted RPC permissions';
  end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal2',
  'session_id',session_id,'amr',jsonb_build_array(jsonb_build_object('method','totp',
  'timestamp',floor(extract(epoch from now())))))::text,true) from video_fixture;
set local role authenticated;
do $$
declare p uuid := (select product_id from video_fixture); j uuid;
begin
  if p is null then raise exception 'TEST fixture needs a published product without video jobs.'; end if;
  j := public.reserve_product_video(p,1000);
  perform public.begin_product_video_upload(j);
end $$;
reset role;
set local role service_role;
do $$
declare j public.product_video_jobs;
begin
  select * into j from public.product_video_jobs where product_id=(select product_id from video_fixture);
  if not public.finish_product_video_upload(j.id,j.lease) then raise exception 'FAIL: upload not queued'; end if;
  -- Isolate this fixture from other queued test data.
  update public.product_video_jobs set status='processing',writer_active=true,lease=gen_random_uuid()
    where id=j.id returning * into j;
  if public.finish_product_video(j.id,gen_random_uuid(),2000,20,1280,720) then raise exception 'FAIL: stale lease accepted'; end if;
  if not public.finish_product_video(j.id,j.lease,2000,20,1280,720) then raise exception 'FAIL: staging failed'; end if;
  if (select status from public.product_video_jobs where id=j.id)<>'review' then raise exception 'FAIL: not staged for review'; end if;
  if exists(select 1 from public.product_making_videos where product_id=j.product_id) then
    raise exception 'FAIL: processing auto-published private draft';
  end if;
end $$;
reset role;
set local role anon;
do $$ begin
  if exists(select 1 from public.product_making_videos where product_id=(select product_id from video_fixture)) then
    raise exception 'FAIL: anonymous user can see review draft';
  end if;
end $$;
reset role;
set local role authenticated;
select public.begin_product_video_publish(id) from public.product_video_jobs where product_id=(select product_id from video_fixture);
reset role;
set local role service_role;
do $$
declare j public.product_video_jobs;
begin
  select * into j from public.product_video_jobs where product_id=(select product_id from video_fixture);
  if not public.finish_product_video_publish(j.id,j.lease,'https://example.com/live.mp4','https://example.com/live.webp') then
    raise exception 'FAIL: explicit publication failed';
  end if;
end $$;
reset role;
set local role anon;
do $$ begin
  if not exists(select 1 from public.product_making_videos where product_id=(select product_id from video_fixture)) then
    raise exception 'FAIL: anonymous user cannot read approved published video';
  end if;
end $$;
reset role;
set local role authenticated;
do $$
declare p uuid := (select product_id from video_fixture); j uuid;
begin
  j := public.reserve_product_video(p,1000);
  perform public.begin_product_video_upload(j);
  perform public.discard_product_video(p);
  if not exists(select 1 from public.product_making_videos where product_id=p and video_url='https://example.com/live.mp4') then
    raise exception 'FAIL: discarding replacement removed current public video';
  end if;
end $$;
reset role;
set local role service_role;
do $$
declare j public.product_video_jobs;
begin
  select * into j from public.product_video_jobs where product_id=(select product_id from video_fixture) and status='discarding';
  if public.finish_product_video_discard(j.id) then raise exception 'FAIL: discard succeeded while writer active'; end if;
  if public.finish_product_video_upload(j.id,j.lease) then raise exception 'FAIL: late upload resurrected discarded draft'; end if;
  -- The service calls this only AFTER R2 deletions; edge/worker tests verify that ordering.
  if not public.finish_product_video_discard(j.id) then raise exception 'FAIL: quiescent cleanup not confirmed'; end if;
end $$;
reset role;
select set_config('request.jwt.claims','{"role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
do $$ begin
  begin
    perform public.reserve_product_video((select product_id from video_fixture),1000);
    raise exception 'FAIL: non-admin reserved upload';
  exception when raise_exception then if sqlerrm<>'Admin access required' then raise; end if; end;
end $$;
reset role;
rollback;
