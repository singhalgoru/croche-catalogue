-- Rollback-only checks; run against a migrated TEST database.
begin;
create temporary table reference_video_fixture as select gen_random_uuid() admin_id, gen_random_uuid() other_id,
  gen_random_uuid() session_id, gen_random_uuid() factor_id, gen_random_uuid() product_id;
grant select on reference_video_fixture to authenticated, anon;
insert into auth.users(id) select admin_id from reference_video_fixture
union all select other_id from reference_video_fixture;
insert into public.catalogue_admins(user_id) select admin_id from reference_video_fixture;
insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at,secret)
  select factor_id,admin_id,'totp','verified',now(),now(),'fixture' from reference_video_fixture;
insert into auth.sessions(id,user_id,factor_id,aal,created_at,updated_at)
  select session_id,admin_id,factor_id,'aal2',now(),now() from reference_video_fixture;
insert into public.products(id,name,category,description,color,image_path,image_url,created_by,published)
  select product_id,'Synthetic Reference Video','Toys','Test product.','#f6c453',
    'test-reference-'||product_id||'.webp','https://example.test/test.webp',admin_id,false from reference_video_fixture;

do $$ begin
  if has_table_privilege('anon','public.product_reference_videos','SELECT')
    or has_table_privilege('authenticated','public.product_reference_videos','SELECT')
    or has_table_privilege('authenticated','public.product_reference_videos','INSERT')
    or has_function_privilege('anon','public.read_product_reference_video(uuid)','EXECUTE')
    or has_function_privilege('anon','public.save_product_reference_video(uuid,text,text)','EXECUTE') then
    raise exception 'FAIL: reference video data exposed.';
  end if;
end $$;

select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal1')::text,true) from reference_video_fixture;
set local role authenticated;
do $$ begin
  begin
    perform public.read_product_reference_video((select product_id from reference_video_fixture));
    raise exception 'FAIL: unverified admin read link.';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    perform public.save_product_reference_video((select product_id from reference_video_fixture),null,'https://example.test/video');
    raise exception 'FAIL: unverified admin saved link.';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
end $$;
reset role;

select set_config('request.jwt.claims',jsonb_build_object('sub',other_id,'role','authenticated','aal','aal2')::text,true) from reference_video_fixture;
set local role authenticated;
do $$ begin
  begin
    perform public.read_product_reference_video((select product_id from reference_video_fixture));
    raise exception 'FAIL: non-admin read link.';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
end $$;
reset role;

select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal2','session_id',session_id,
  'amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from now())))))::text,true) from reference_video_fixture;
set local role authenticated;
do $$ declare id uuid; bad text; begin
  select product_id into id from reference_video_fixture;
  if public.read_product_reference_video(id) is not null then raise exception 'FAIL: unexpected initial link.'; end if;
  foreach bad in array array['javascript:alert(1)','http://example.test/video','https://name:password@example.test/video',
    'https://example.test/a b', 'https://example.test/'||repeat('x',2048)] loop
    begin
      perform public.save_product_reference_video(id,null,bad);
      raise exception 'FAIL: unsafe link accepted.';
    exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  end loop;
  perform public.save_product_reference_video(id,null,'https://youtu.be/first');
  if public.read_product_reference_video(id) <> 'https://youtu.be/first' then raise exception 'FAIL: link not stored.'; end if;
  begin
    perform public.save_product_reference_video(id,null,'https://youtu.be/stale');
    raise exception 'FAIL: stale link overwritten.';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  perform public.save_product_reference_video(id,'https://youtu.be/first','https://youtu.be/second');
  if public.read_product_reference_video(id) <> 'https://youtu.be/second' then raise exception 'FAIL: link not updated.'; end if;
  perform public.save_product_reference_video(id,'https://youtu.be/second',null);
  if public.read_product_reference_video(id) is not null then raise exception 'FAIL: link not removed.'; end if;
  perform public.save_product_reference_video(id,null,'https://youtu.be/last');
end $$;
reset role;
delete from public.products where id = (select product_id from reference_video_fixture);
do $$ begin
  if exists(select 1 from public.product_reference_videos where product_id = (select product_id from reference_video_fixture)) then
    raise exception 'FAIL: product deletion did not remove link.';
  end if;
end $$;
rollback;
