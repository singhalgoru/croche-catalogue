begin;

create temporary table marketing_fixture as
select gen_random_uuid() user_id, gen_random_uuid() session_id, gen_random_uuid() factor_id;
grant select on marketing_fixture to authenticated;
insert into auth.users(id) select user_id from marketing_fixture;
insert into public.catalogue_admins(user_id) select user_id from marketing_fixture;
insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at,secret)
select factor_id,user_id,'totp','verified',now(),now(),'fixture' from marketing_fixture;
insert into auth.sessions(id,user_id,factor_id,aal,created_at,updated_at)
select session_id,user_id,factor_id,'aal2',now(),now() from marketing_fixture;

select set_config('request.jwt.claims',jsonb_build_object(
  'sub',user_id,'role','authenticated','aal','aal2','session_id',session_id,
  'amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from now()))))
)::text,true) from marketing_fixture;
set local role authenticated;
do $$
declare draft_id uuid; rejected_id uuid; reviewed public.marketing_campaign_drafts;
begin
  insert into public.marketing_campaign_drafts(brief,proposal)
  values ('{"fixture":true}','{"fixture":true}') returning id into draft_id;
  if not exists(select 1 from public.marketing_campaign_drafts where id=draft_id and created_by=auth.uid()) then
    raise exception 'FAIL: verified admin cannot save/read a draft.';
  end if;
  begin
    insert into public.marketing_campaign_drafts(brief,proposal,status,reviewed_by,reviewed_at)
    values ('{}','{}','approved',auth.uid(),now());
    raise exception 'FAIL: direct approved insert permitted.' using errcode='23514';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.marketing_campaign_drafts set proposal='{}' where id=draft_id;
    raise exception 'FAIL: direct draft editing permitted.' using errcode='23514';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.review_marketing_campaign_draft(draft_id,null);
    raise exception 'FAIL: null decision permitted.' using errcode='23514';
  exception when raise_exception then
    if sqlerrm <> 'Decision must be approved or rejected.' then raise; end if;
  end;
  reviewed := public.review_marketing_campaign_draft(draft_id,'approved');
  if reviewed.status <> 'approved' or reviewed.reviewed_by <> auth.uid() or reviewed.reviewed_at is null then
    raise exception 'FAIL: approval audit missing.';
  end if;
  begin
    perform public.review_marketing_campaign_draft(draft_id,'rejected');
    raise exception 'FAIL: reviewed draft changed.' using errcode='23514';
  exception when raise_exception then
    if sqlerrm <> 'Draft was not found or has already been reviewed.' then raise; end if;
  end;
  insert into public.marketing_campaign_drafts(brief,proposal)
  values ('{}','{}') returning id into rejected_id;
  reviewed := public.review_marketing_campaign_draft(rejected_id,'rejected');
  if reviewed.status <> 'rejected' then raise exception 'FAIL: rejection was not recorded.'; end if;
end $$;
reset role;

select set_config('request.jwt.claims',jsonb_build_object(
  'sub',user_id,'role','authenticated','aal','aal1','session_id',session_id
)::text,true) from marketing_fixture;
set local role authenticated;
do $$
begin
  if exists(select 1 from public.marketing_campaign_drafts) then
    raise exception 'FAIL: password-only admin read drafts.';
  end if;
  begin
    insert into public.marketing_campaign_drafts(brief,proposal) values ('{}','{}');
    raise exception 'FAIL: password-only admin saved draft.' using errcode='23514';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.review_marketing_campaign_draft(gen_random_uuid(),'approved');
    raise exception 'FAIL: password-only admin reviewed draft.' using errcode='23514';
  exception when raise_exception then
    if sqlerrm <> 'Verified admin access required.' then raise; end if;
  end;
end $$;
reset role;
set local role anon;
do $$
begin
  begin
    perform 1 from public.marketing_campaign_drafts;
    raise exception 'FAIL: anonymous draft access permitted.' using errcode='23514';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
rollback;
