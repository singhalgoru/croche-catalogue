begin;
create temporary table identity_fixture as select gen_random_uuid() admin_id,gen_random_uuid() applicant_id,
  gen_random_uuid() session_id,gen_random_uuid() factor_id,gen_random_uuid() invite_id,gen_random_uuid() application_id,
  repeat('e',64) token,
  '{"fullName":"Synthetic Identity Fixture","mobile":"9876543210","city":"Gurugram","state":"Haryana","pin":"122001",
    "language":"Hindi","skills":"Crochet flowers","availability":"5 hours/week","experience":"","tools":"",
    "portfolioUrl":"","notes":"","adult":true,"consent":true,"paidTrial":true}'::jsonb details,
  jsonb_build_object('documentType','masked_aadhaar','contentType','image/webp','consent',true,
    'data',encode(decode('52494646080000005745425056503820','hex'),'base64')) document;
grant select on identity_fixture to authenticated,anon;
insert into auth.users(id) select admin_id from identity_fixture;
insert into auth.users(id,is_anonymous) select applicant_id,true from identity_fixture;
insert into public.catalogue_admins(user_id) select admin_id from identity_fixture;
insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at,secret)
select factor_id,admin_id,'totp','verified',now(),now(),'fixture' from identity_fixture;
insert into auth.sessions(id,user_id,factor_id,aal,created_at,updated_at)
select session_id,admin_id,factor_id,'aal2',now(),now() from identity_fixture;
select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal2','session_id',session_id,
  'amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from now())))))::text,true)
from identity_fixture;
set local role authenticated;
select public.create_artisan_invitation(invite_id,token,'Synthetic Fixture','whatsapp','9876543210') from identity_fixture;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',applicant_id,'role','authenticated')::text,true) from identity_fixture;
set local role authenticated;
do $$ declare f record; bad_document jsonb; begin
  select * into f from identity_fixture;
  foreach bad_document in array array[
    f.document||'{"consent":false}'::jsonb,
    f.document||'{"documentType":"full_aadhaar"}'::jsonb,
    f.document||'{"contentType":"text/html"}'::jsonb,
    f.document||jsonb_build_object('data',encode(convert_to('<html>not an image</html>','UTF8'),'base64')),
    f.document||jsonb_build_object('data',repeat('a',1398108))
  ] loop
    begin
      perform public.submit_artisan_application(f.application_id,f.details,'2026-10-29.2',f.token,'2026-10-29.1',bad_document);
      raise exception 'FAIL: invalid ID accepted.';
    exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  end loop;
  perform public.submit_artisan_application(f.application_id,f.details,'2026-10-29.2',f.token,'2026-10-29.1',f.document);
  perform public.submit_artisan_application(f.application_id,f.details,'2026-10-29.2',f.token,'2026-10-29.1',f.document);
  begin
    perform public.submit_artisan_application(f.application_id,f.details,'2026-10-29.2',f.token,'2026-10-29.1',null);
    raise exception 'FAIL: replay silently changed ID.';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    perform 1 from public.artisan_identity_documents;
    raise exception 'FAIL: applicant can read ID bytes.';
  exception when insufficient_privilege then null; end;
  begin
    perform public.read_artisan_identity_document(f.application_id);
    raise exception 'FAIL: applicant can use ID read RPC.';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    perform public.remove_artisan_identity_document(f.application_id,1);
    raise exception 'FAIL: applicant can remove ID.';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
end $$;
reset role;
set local role anon;
do $$ begin
  begin
    perform 1 from public.artisan_identity_documents;
    raise exception 'FAIL: anonymous users can read ID bytes.';
  exception when insufficient_privilege then null; end;
  begin
    perform public.expire_artisan_identity_documents();
    raise exception 'FAIL: anonymous users can run ID cleanup.';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ declare f record; begin
  select * into f from identity_fixture;
  if (select count(*) from public.artisan_identity_documents where application_id=f.application_id)<>1 then raise exception 'FAIL: ID not stored exactly once.'; end if;
  if not exists(select 1 from public.artisan_applications where id=f.application_id
    and dispatch_terms_version='2026-10-29.1' and dispatch_terms_accepted_at is not null
    and consent_version='2026-10-29.2' and identity_type='masked_aadhaar') then raise exception 'FAIL: acknowledgement metadata missing.'; end if;
  if not exists(select 1 from public.artisan_identity_documents where application_id=f.application_id and expires_at-consented_at=interval '30 days') then raise exception 'FAIL: ID retention interval.'; end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal1','session_id',session_id)::text,true) from identity_fixture;
set local role authenticated;
do $$ begin
  begin
    perform public.read_artisan_identity_document((select application_id from identity_fixture));
    raise exception 'FAIL: admin without MFA can read ID.';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal2','session_id',session_id,
  'amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from now())))))::text,true)
from identity_fixture;
set local role authenticated;
do $$ declare f record; result jsonb; begin
  select * into f from identity_fixture;
  result:=public.read_artisan_identity_document(f.application_id);
  if result->>'data'<>f.document->>'data' then raise exception 'FAIL: returned wrong ID bytes.'; end if;
  result:=public.list_artisan_applications('Synthetic Identity Fixture','',0);
  if result::text like '%"content"%' or result::text like '%"data"%' then raise exception 'FAIL: directory contains document bytes.'; end if;
  if not exists(select 1 from public.artisan_application_history where application_id=f.application_id and action='ID viewed') then raise exception 'FAIL: ID view not audited.'; end if;
  begin
    perform 1 from public.artisan_identity_documents;
    raise exception 'FAIL: admin can directly select ID bytes.';
  exception when insufficient_privilege then null; end;
  begin
    perform public.remove_artisan_identity_document(f.application_id,999);
    raise exception 'FAIL: stale ID deletion accepted.';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  perform public.remove_artisan_identity_document(f.application_id,1);
end $$;
reset role;
do $$ begin
  if exists(select 1 from public.artisan_identity_documents where application_id=(select application_id from identity_fixture)) then raise exception 'FAIL: manual ID removal left bytes.'; end if;
  if not exists(select 1 from public.artisan_applications where id=(select application_id from identity_fixture) and identity_type is null and version=2) then raise exception 'FAIL: removal changed application incorrectly.'; end if;
end $$;
insert into public.artisan_identity_documents(application_id,document_type,content,content_type,consent_version,expires_at)
select application_id,'alternative_id',decode(document->>'data','base64'),'image/webp','2026-10-29.2',now()-interval '1 minute' from identity_fixture;
update public.artisan_applications set identity_type='alternative_id',identity_expires_at=now()-interval '1 minute'
where id=(select application_id from identity_fixture);
set local role authenticated;
do $$ begin
  begin
    perform public.read_artisan_identity_document((select application_id from identity_fixture));
    raise exception 'FAIL: expired ID readable before cleanup.';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
end $$;
reset role;
select public.expire_artisan_identity_documents();
do $$ begin
  if exists(select 1 from public.artisan_identity_documents where application_id=(select application_id from identity_fixture))
    or exists(select 1 from public.artisan_applications where id=(select application_id from identity_fixture) and identity_type is not null) then
    raise exception 'FAIL: ID retention cleanup incomplete.';
  end if;
end $$;
insert into public.artisan_identity_documents(application_id,document_type,content,content_type,consent_version)
select application_id,'alternative_id',decode(document->>'data','base64'),'image/webp','2026-10-29.2' from identity_fixture;
set local role authenticated;
select public.delete_artisan_application(application_id,3) from identity_fixture;
reset role;
do $$ begin
  if exists(select 1 from public.artisan_identity_documents where application_id=(select application_id from identity_fixture)) then
    raise exception 'FAIL: application deletion did not cascade ID bytes.';
  end if;
end $$;
rollback;
