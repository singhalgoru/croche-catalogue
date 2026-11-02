begin;
create temporary table love_fixture as select gen_random_uuid() admin_id,gen_random_uuid() session_id,
  gen_random_uuid() factor_id,gen_random_uuid() testimonial_id;
grant select on love_fixture to anon,authenticated;
insert into auth.users(id) select admin_id from love_fixture;
insert into public.catalogue_admins(user_id) select admin_id from love_fixture;
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
    'consent_source','','published',false,'featured',true,'sort_order',0);
  perform public.save_customer_love(f.testimonial_id,0,draft,encode(decode('524946460400000057454250','hex'),'base64'));
  if public.customer_love_photo(f.testimonial_id,true) is null then raise exception 'FAIL: admin draft photo missing.'; end if;
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
select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
do $$ declare f record; begin
  select * into f from love_fixture;
  if exists(select 1 from jsonb_array_elements(public.list_customer_love(false)) e where e->>'id'=f.testimonial_id::text)
    then raise exception 'FAIL: draft publicly listed.'; end if;
  if public.customer_love_photo(f.testimonial_id,false) is not null then raise exception 'FAIL: draft photo public.'; end if;
  begin perform public.list_customer_love(true); raise exception 'FAIL: anonymous admin listing allowed.';
    exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin perform 1 from public.customer_love; raise exception 'FAIL: private table readable.';
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
    'consent_confirmed',true,'consent_date',current_date,'consent_source','Synthetic permission'),null);
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
  if public.customer_love_photo(f.testimonial_id,false) is null then raise exception 'FAIL: published photo missing.'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal2',
  'session_id',session_id,'amr',jsonb_build_array(jsonb_build_object('method','totp',
    'timestamp',floor(extract(epoch from now())))))::text,true) from love_fixture;
set local role authenticated;
do $$ declare f record; entry jsonb; begin
  select * into f from love_fixture;
  select e into entry from jsonb_array_elements(public.list_customer_love(true)) e where e->>'id'=f.testimonial_id::text;
  perform public.save_customer_love(f.testimonial_id,2,entry || '{"published":false,"consent_confirmed":false}'::jsonb,null);
end $$;
reset role;
select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
do $$ declare f record; begin
  select * into f from love_fixture;
  if public.customer_love_photo(f.testimonial_id,false) is not null then raise exception 'FAIL: revoked photo still public.'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal2',
  'session_id',session_id,'amr',jsonb_build_array(jsonb_build_object('method','totp',
    'timestamp',floor(extract(epoch from now())))))::text,true) from love_fixture;
set local role authenticated;
select public.delete_customer_love(testimonial_id,3) from love_fixture;
reset role;
do $$ begin
  if exists(select 1 from public.customer_love where id=(select testimonial_id from love_fixture))
    then raise exception 'FAIL: deleted testimonial retained.'; end if;
end $$;
rollback;
