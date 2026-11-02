begin;
create temporary table love_fixture as select gen_random_uuid() admin_id,gen_random_uuid() session_id,
  gen_random_uuid() factor_id,gen_random_uuid() testimonial_id,
  gen_random_uuid() product_one,gen_random_uuid() product_two,gen_random_uuid() product_private;
grant select on love_fixture to anon,authenticated,service_role;
update public.customer_love_discovery set changed_at='2000-01-01T00:00:00Z';
insert into auth.users(id) select admin_id from love_fixture;
insert into public.catalogue_admins(user_id) select admin_id from love_fixture;
insert into public.products(id,name,category,description,color,image_path,image_url,created_by,published,price)
select id,'Synthetic love product','Toys','Synthetic product for testimonial regression.','#ffffff',
  'synthetic-love-'||id::text,'https://example.test/synthetic.webp',f.admin_id,id<>f.product_private,100
from love_fixture f cross join lateral unnest(array[f.product_one,f.product_two,f.product_private]) id;
insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at,secret)
select factor_id,admin_id,'totp','verified',now(),now(),'fixture' from love_fixture;
insert into auth.sessions(id,user_id,factor_id,aal,created_at,updated_at)
select session_id,admin_id,factor_id,'aal2',now(),now() from love_fixture;
select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal2',
  'session_id',session_id,'amr',jsonb_build_array(jsonb_build_object('method','totp',
    'timestamp',floor(extract(epoch from now())))))::text,true) from love_fixture;
set local role authenticated;
do $$ declare f record; draft jsonb; begin
  select * into f from love_fixture;
  draft := jsonb_build_object('display_name','Synthetic customer','quote','A lovely handmade keepsake.',
    'image_alt','Synthetic WebP photo','consent_confirmed',false,'consent_date','',
    'consent_source','','published',false,'featured',true,'sort_order',0,'product_id',f.product_one);
  perform public.save_customer_love(f.testimonial_id,0,draft,encode(decode('524946460400000057454250','hex'),'base64'));
  if public.customer_love_photo(f.testimonial_id,true) is null then raise exception 'FAIL: admin draft photo missing.'; end if;
  if not exists(select 1 from jsonb_array_elements(public.list_customer_love(true)) e
    where e->>'id'=f.testimonial_id::text and e->'product_ids'=jsonb_build_array(f.product_one))
    then raise exception 'FAIL: legacy product tag not preserved.'; end if;
  begin
    perform public.save_customer_love(f.testimonial_id,1,draft || '{"published":true}'::jsonb,null);
    raise exception 'FAIL: publication without permission allowed.';
  exception when check_violation then null; end;
  begin
    perform public.save_customer_love(f.testimonial_id,1,draft,'aW52YWxpZA==');
    raise exception 'FAIL: invalid photo accepted.';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
end $$;
reset role;
do $$ begin
  if (select changed_at from public.customer_love_discovery) <> '2000-01-01T00:00:00Z'::timestamptz
    then raise exception 'FAIL: draft-only save changed public discovery date.'; end if;
end $$;
select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
do $$ declare f record; begin
  select * into f from love_fixture;
  if exists(select 1 from jsonb_array_elements(public.list_customer_love(false)) e where e->>'id'=f.testimonial_id::text)
    then raise exception 'FAIL: draft publicly listed.'; end if;
  begin perform public.customer_love_photo(f.testimonial_id,false); raise exception 'FAIL: anonymous photo read allowed.';
    exception when insufficient_privilege then null; end;
  begin perform public.customer_love_photo_sources(f.testimonial_id,true); raise exception 'FAIL: anonymous photo source read allowed.';
    exception when insufficient_privilege then null; end;
  begin perform public.set_customer_love_image_url(f.testimonial_id,null,null); raise exception 'FAIL: anonymous R2 URL update allowed.';
    exception when insufficient_privilege then null; end;
  begin perform public.list_customer_love(true); raise exception 'FAIL: anonymous admin listing allowed.';
    exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin perform 1 from public.customer_love; raise exception 'FAIL: private table readable.';
    exception when insufficient_privilege then null; end;
  begin perform 1 from public.customer_love_products; raise exception 'FAIL: private product tags readable.';
    exception when insufficient_privilege then null; end;
  begin perform public.delete_customer_love(f.testimonial_id,1); raise exception 'FAIL: anonymous delete allowed.';
    exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal2',
  'session_id',session_id,'amr',jsonb_build_array(jsonb_build_object('method','totp',
    'timestamp',floor(extract(epoch from now())))))::text,true) from love_fixture;
set local role authenticated;
do $$ declare f record; entry jsonb; begin
  select * into f from love_fixture;
  select e into entry from jsonb_array_elements(public.list_customer_love(true)) e where e->>'id'=f.testimonial_id::text;
  perform public.save_customer_love(f.testimonial_id,1,entry || jsonb_build_object('published',true,
    'consent_confirmed',true,'consent_date',current_date,'consent_source','Synthetic permission',
    'product_ids',jsonb_build_array(f.product_one,f.product_two,f.product_private,f.product_one)),null);
  select e into entry from jsonb_array_elements(public.list_customer_love(true)) e where e->>'id'=f.testimonial_id::text;
  if jsonb_array_length(entry->'product_ids')<>3 then raise exception 'FAIL: multiple tags not saved or deduplicated.'; end if;
  begin perform public.save_customer_love(f.testimonial_id,2,entry || '{"product_ids":null}'::jsonb,null);
    raise exception 'FAIL: malformed tags accepted.';
    exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin perform public.save_customer_love(f.testimonial_id,2,entry || jsonb_build_object('product_ids',jsonb_build_array(gen_random_uuid())),null);
    raise exception 'FAIL: missing product accepted.';
    exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin perform public.save_customer_love(f.testimonial_id,1,entry,null);
    raise exception 'FAIL: stale save overwrote testimonial.';
    exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin perform public.delete_customer_love(f.testimonial_id,1);
    raise exception 'FAIL: stale delete accepted.';
    exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
end $$;
reset role;
select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
do $$ declare f record; entry jsonb; begin
  select * into f from love_fixture;
  select e into entry from jsonb_array_elements(public.list_customer_love(false)) e where e->>'id'=f.testimonial_id::text;
  if entry is null or entry ? 'consent_source' or entry ? 'consent_date' or entry ? 'version'
    then raise exception 'FAIL: public view missing or reveals private metadata.'; end if;
  if entry->'has_image'<>'false'::jsonb or entry->'image_url'<>'null'::jsonb then
    raise exception 'FAIL: photo advertised before its R2 copy exists.'; end if;
  if jsonb_array_length(entry->'product_ids')<>2 or not (entry->'product_ids' @> jsonb_build_array(f.product_one,f.product_two))
    or entry->'product_ids' @> jsonb_build_array(f.product_private) then
    raise exception 'FAIL: public product tags missing or unpublished tag exposed.'; end if;
end $$;
reset role;
set local role service_role;
do $$ declare f record; source jsonb; url text; entry jsonb; begin
  select * into f from love_fixture;
  source := public.customer_love_photo_sources(f.testimonial_id,true)->0;
  if source->>'photo' is null or length(source->>'sha256')<>64 then raise exception 'FAIL: published photo source missing.'; end if;
  if exists(select 1 from jsonb_array_elements(public.customer_love_photo_sources(null,false)) e where e->>'photo' is not null)
    then raise exception 'FAIL: listing returned photo bytes.'; end if;
  url := 'https://images.example.test/customer-reviews/'||f.testimonial_id||'-'||left(source->>'sha256',16)||'.webp';
  if public.set_customer_love_image_url(f.testimonial_id,repeat('0',64),url) then raise exception 'FAIL: stale photo hash accepted.'; end if;
  if not public.set_customer_love_image_url(f.testimonial_id,source->>'sha256',url) then raise exception 'FAIL: R2 URL not recorded.'; end if;
  begin
    perform public.set_customer_love_image_url(f.testimonial_id,source->>'sha256','https://evil.test/x.webp');
    raise exception 'FAIL: arbitrary image URL accepted.';
  exception when check_violation then null; end;
end $$;
reset role;
set local role anon;
do $$ declare f record; entry jsonb; begin
  select * into f from love_fixture;
  select e into entry from jsonb_array_elements(public.list_customer_love(false)) e where e->>'id'=f.testimonial_id::text;
  if entry->'has_image'<>'true'::jsonb or entry->>'image_url' not like 'https://images.example.test/customer-reviews/%'
    then raise exception 'FAIL: public R2 photo URL missing.'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal2',
  'session_id',session_id,'amr',jsonb_build_array(jsonb_build_object('method','totp',
    'timestamp',floor(extract(epoch from now())))))::text,true) from love_fixture;
set local role authenticated;
do $$ declare f record; entry jsonb; begin
  select * into f from love_fixture;
  select e into entry from jsonb_array_elements(public.list_customer_love(true)) e where e->>'id'=f.testimonial_id::text;
  perform public.save_customer_love(f.testimonial_id,2,entry - 'product_ids',null);
  select e into entry from jsonb_array_elements(public.list_customer_love(true)) e where e->>'id'=f.testimonial_id::text;
  if jsonb_array_length(entry->'product_ids')<>3 then raise exception 'FAIL: older editor erased additional tags.'; end if;
  if entry->>'image_url' is null then raise exception 'FAIL: unchanged photo lost its R2 URL.'; end if;
  perform public.save_customer_love(f.testimonial_id,3,entry || '{"published":false,"consent_confirmed":false}'::jsonb,null);
end $$;
reset role;
delete from public.products where id=(select product_private from love_fixture);
do $$ begin
  if (select count(*) from public.customer_love_products where testimonial_id=(select testimonial_id from love_fixture))<>2
    or not exists(select 1 from public.customer_love where id=(select testimonial_id from love_fixture)) then
    raise exception 'FAIL: deleting a product removed the story or retained its tag.'; end if;
end $$;
do $$ begin
  if (select image_url from public.customer_love where id=(select testimonial_id from love_fixture)) is not null
    then raise exception 'FAIL: withdrawn testimonial kept its public R2 URL.'; end if;
end $$;
select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
do $$ declare f record; begin
  select * into f from love_fixture;
  if exists(select 1 from jsonb_array_elements(public.list_customer_love(false)) e where e->>'id'=f.testimonial_id::text)
    then raise exception 'FAIL: revoked story still public.'; end if;
  if public.customer_love_last_changed() is distinct from to_char(now() at time zone 'UTC','YYYY-MM-DD')
    then raise exception 'FAIL: publication/withdrawal did not refresh the discovery date.'; end if;
  begin
    perform 1 from public.customer_love_discovery;
    raise exception 'FAIL: anon read discovery table directly.';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal2',
  'session_id',session_id,'amr',jsonb_build_array(jsonb_build_object('method','totp',
    'timestamp',floor(extract(epoch from now())))))::text,true) from love_fixture;
set local role authenticated;
select public.delete_customer_love(testimonial_id,4) from love_fixture;
reset role;
do $$ begin
  if exists(select 1 from public.customer_love where id=(select testimonial_id from love_fixture))
    then raise exception 'FAIL: deleted testimonial retained.'; end if;
  if exists(select 1 from public.customer_love_products where testimonial_id=(select testimonial_id from love_fixture))
    then raise exception 'FAIL: deleted testimonial tags retained.'; end if;
end $$;
rollback;
