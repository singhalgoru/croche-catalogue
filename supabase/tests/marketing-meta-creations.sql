begin;

create temporary table meta_creation_fixture as
select gen_random_uuid() user_id, gen_random_uuid() session_id,
  gen_random_uuid() factor_id, gen_random_uuid() draft_id;
grant select on meta_creation_fixture to authenticated, service_role;
insert into auth.users(id) select user_id from meta_creation_fixture;
insert into public.catalogue_admins(user_id) select user_id from meta_creation_fixture;
insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at,secret)
select factor_id,user_id,'totp','verified',now(),now(),'fixture' from meta_creation_fixture;
insert into auth.sessions(id,user_id,factor_id,aal,created_at,updated_at)
select session_id,user_id,factor_id,'aal2',now(),now() from meta_creation_fixture;
select set_config('request.jwt.claims',jsonb_build_object(
  'sub',user_id,'role','authenticated','aal','aal2','session_id',session_id,
  'amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from now()))))
)::text,true) from meta_creation_fixture;

set local role authenticated;
insert into public.marketing_campaign_drafts(id,brief,proposal)
select draft_id,'{}','{}' from meta_creation_fixture;
select public.review_marketing_campaign_draft(draft_id,'approved') from meta_creation_fixture;
do $$
begin
  begin
    insert into public.marketing_meta_creations(draft_id,account_id,request)
    select draft_id,'123','{}' from meta_creation_fixture;
    raise exception 'FAIL: browser could reserve a Meta write.' using errcode='23514';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role service_role;
insert into public.marketing_meta_creations(draft_id,account_id,request,requested_by)
select draft_id,'123','{}',user_id from meta_creation_fixture;
do $$
begin
  begin
    insert into public.marketing_meta_creations(draft_id,account_id,request)
    select draft_id,'123','{}' from meta_creation_fixture;
    raise exception 'FAIL: duplicate creation claim permitted.' using errcode='23514';
  exception when unique_violation then null;
  end;
  begin
    update public.marketing_meta_creations set status='created'
    where draft_id=(select draft_id from meta_creation_fixture);
    raise exception 'FAIL: incomplete creation marked successful.' using errcode='23503';
  exception when check_violation then null;
  end;
end $$;
update public.marketing_meta_creations set status='needs_attention',campaign_id='10',error='Fixture partial failure'
where draft_id=(select draft_id from meta_creation_fixture);
reset role;

set local role authenticated;
do $$
begin
  if not exists (
    select 1 from public.marketing_meta_creations
    where draft_id=(select draft_id from meta_creation_fixture)
      and status='needs_attention' and campaign_id='10'
  ) then raise exception 'FAIL: fresh-MFA admin cannot inspect partial progress.'; end if;
  begin
    update public.marketing_meta_creations set status='creating';
    raise exception 'FAIL: browser could rewrite a creation attempt.' using errcode='23514';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.marketing_meta_creations;
    raise exception 'FAIL: browser could remove duplicate protection.' using errcode='23514';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select set_config('request.jwt.claims',jsonb_build_object(
  'sub',user_id,'role','authenticated','aal','aal1','session_id',session_id
)::text,true) from meta_creation_fixture;
set local role authenticated;
do $$
begin
  if exists(select 1 from public.marketing_meta_creations) then
    raise exception 'FAIL: password-only session read Meta creation records.';
  end if;
end $$;
reset role;
set local role anon;
do $$
begin
  begin
    perform 1 from public.marketing_meta_creations;
    raise exception 'FAIL: anonymous creation access permitted.' using errcode='23514';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
rollback;
