begin;

create temporary table social_post_fixture as
select gen_random_uuid() user_id, gen_random_uuid() session_id, gen_random_uuid() factor_id,
  gen_random_uuid() product_id, gen_random_uuid() post_id;
grant select on social_post_fixture to authenticated, service_role;
insert into auth.users(id) select user_id from social_post_fixture;
insert into public.catalogue_admins(user_id) select user_id from social_post_fixture;
insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at,secret)
select factor_id,user_id,'totp','verified',now(),now(),'fixture' from social_post_fixture;
insert into auth.sessions(id,user_id,factor_id,aal,created_at,updated_at)
select session_id,user_id,factor_id,'aal2',now(),now() from social_post_fixture;
select set_config('request.jwt.claims',jsonb_build_object(
  'sub',user_id,'role','authenticated','aal','aal2','session_id',session_id,
  'amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from now()))))
)::text,true) from social_post_fixture;

set local role authenticated;
do $$
begin
  begin
    insert into public.marketing_social_posts(product_id,platform,request)
    select product_id,'facebook','{}' from social_post_fixture;
    raise exception 'FAIL: browser could reserve a publishing attempt.';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role service_role;
insert into public.marketing_social_posts(id,product_id,platform,request,requested_by)
select post_id,product_id,'facebook','{}',user_id from social_post_fixture;
insert into public.marketing_social_posts(product_id,platform,request)
select product_id,'instagram','{}' from social_post_fixture;
do $$
declare claimed integer;
begin
  begin
    insert into public.marketing_social_posts(product_id,platform,request)
    select product_id,'facebook','{}' from social_post_fixture;
    raise exception 'FAIL: duplicate product/platform post permitted.';
  exception when unique_violation then null;
  end;
  begin
    update public.marketing_social_posts set status='published'
    where id=(select post_id from social_post_fixture);
    raise exception 'FAIL: incomplete publication marked successful.';
  exception when check_violation then null;
  end;
  update public.marketing_social_posts
    set status='publishing',attempt_started_at=now(),publish_started_at=now(),revision=revision+1
    where id=(select post_id from social_post_fixture) and status='draft' and revision=1;
  get diagnostics claimed=row_count;
  if claimed<>1 then raise exception 'FAIL: first versioned claim was not saved.'; end if;
  update public.marketing_social_posts
    set status='publishing',attempt_started_at=now(),publish_started_at=now(),revision=revision+1
    where id=(select post_id from social_post_fixture) and status='draft' and revision=1;
  get diagnostics claimed=row_count;
  if claimed<>0 then raise exception 'FAIL: competing versioned claim was allowed.'; end if;
  begin
    update public.marketing_social_posts set status='ready',container_id='300'
    where id=(select post_id from social_post_fixture);
    raise exception 'FAIL: Facebook accepted Instagram container state.';
  exception when check_violation then null;
  end;
  update public.marketing_social_posts
    set status='processing',request='{"mediaType":"video"}',post_id='500',
      attempt_started_at=now(),publish_started_at=now()
    where id=(select post_id from social_post_fixture);
  if not found then raise exception 'FAIL: Facebook video could not retain its processing status.'; end if;
  update public.marketing_social_posts
    set request='{}',post_id=null,status='needs_attention'
    where id=(select post_id from social_post_fixture);
  begin
    update public.marketing_social_posts set status='processing',post_id='500'
    where id=(select post_id from social_post_fixture);
    raise exception 'FAIL: Facebook photo accepted video processing state.';
  exception when check_violation then null;
  end;
  update public.marketing_social_posts set status='needs_attention',revision=revision+1
  where id=(select post_id from social_post_fixture);
  update public.marketing_social_posts set request='{"caption":"stale update"}'
  where id=(select post_id from social_post_fixture) and status='draft' and revision=1;
  get diagnostics claimed=row_count;
  if claimed<>0 then raise exception 'FAIL: a stale draft update overwrote a publishing attempt.'; end if;
end $$;
reset role;

set local role authenticated;
do $$
begin
  if (select count(*) from public.marketing_social_posts where product_id=(select product_id from social_post_fixture))<>2 then
    raise exception 'FAIL: fresh-MFA admin cannot inspect per-platform results.';
  end if;
  begin
    update public.marketing_social_posts set status='draft';
    raise exception 'FAIL: browser could reset a publishing attempt.';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.marketing_social_posts;
    raise exception 'FAIL: browser could remove duplicate protection.';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select set_config('request.jwt.claims',jsonb_build_object(
  'sub',user_id,'role','authenticated','aal','aal1','session_id',session_id
)::text,true) from social_post_fixture;
set local role authenticated;
do $$
begin
  if exists(select 1 from public.marketing_social_posts) then
    raise exception 'FAIL: password-only session read social publishing records.';
  end if;
end $$;
reset role;
set local role anon;
do $$
begin
  begin
    perform 1 from public.marketing_social_posts;
    raise exception 'FAIL: anonymous social publishing access permitted.';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
rollback;
