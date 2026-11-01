begin;
create temporary table artisan_fixture as select gen_random_uuid() admin_id,gen_random_uuid() applicant_id,
  gen_random_uuid() session_id,gen_random_uuid() factor_id,gen_random_uuid() invite_id,gen_random_uuid() application_id,
  gen_random_uuid() legacy_invite_id,gen_random_uuid() legacy_application_id,repeat('a',64) token,repeat('f',64) legacy_token,
  '{"fullName":"Sample Maker","mobile":"9876543210","city":"Gurugram","state":"Haryana","pin":"122001",
    "language":"Hindi","skills":"Crochet flowers","availability":"5 hours/week","experience":"","tools":"",
    "portfolioUrl":"","notes":"","adult":true,"consent":true,"paidTrial":true}'::jsonb details;
grant select on artisan_fixture to authenticated,anon;
insert into auth.users(id) select admin_id from artisan_fixture;
insert into auth.users(id,is_anonymous) select applicant_id,true from artisan_fixture;
insert into public.catalogue_admins(user_id) select admin_id from artisan_fixture;
insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at,secret)
select factor_id,admin_id,'totp','verified',now(),now(),'fixture' from artisan_fixture;
insert into auth.sessions(id,user_id,factor_id,aal,created_at,updated_at)
select session_id,admin_id,factor_id,'aal2',now(),now() from artisan_fixture;

select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal2','session_id',session_id,
  'amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from now())))))::text,true)
from artisan_fixture;
set local role authenticated;
do $$ declare f record; invitation jsonb; begin
  select * into f from artisan_fixture;
  invitation:=public.create_artisan_invitation(f.invite_id,f.token,'Sample Maker','email','maker@example.test');
  if invitation->>'id'<>f.invite_id::text or invitation ? 'token_hash' then raise exception 'FAIL: invitation receipt.'; end if;
  if (invitation->>'expires_at')::timestamptz-(invitation->>'created_at')::timestamptz<>interval '24 hours' then raise exception 'FAIL: invitation is not exactly 24 hours.'; end if;
  perform public.create_artisan_invitation(f.invite_id,f.token,'Sample Maker','email','maker@example.test');
  perform public.create_artisan_invitation(f.legacy_invite_id,f.legacy_token,'Legacy Maker','whatsapp','9876543210');
  if (select count(*) from public.artisan_invitations where id=f.invite_id)<>1 then raise exception 'FAIL: duplicate invitation.'; end if;
  begin
    perform public.create_artisan_invitation(f.invite_id,f.token,'Changed','email','maker@example.test');
    raise exception 'FAIL: changed invitation accepted.';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
end $$;
reset role;

set local role anon;
do $$ declare f record; begin
  select * into f from artisan_fixture;
  if public.artisan_invitation_status(f.token)<>'available' then raise exception 'FAIL: valid invitation unavailable.'; end if;
  if public.artisan_invitation_status(repeat('b',64))<>'unavailable' then raise exception 'FAIL: invalid invitation available.'; end if;
  begin
    perform 1 from public.artisan_invitations;
    raise exception 'FAIL: anonymous invitation directory readable.';
  exception when insufficient_privilege then null; end;
  begin
    perform public.submit_artisan_application(f.application_id,f.details,'2026-11-01.1',f.token,'2026-10-29.1',null,null,'maker@example.test');
    raise exception 'FAIL: anonymous RPC submission allowed without session.';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',applicant_id,'role','authenticated')::text,true) from artisan_fixture;
set local role authenticated;
do $$ declare f record; result uuid; begin
  select * into f from artisan_fixture;
  begin
    perform public.submit_artisan_application(f.application_id,f.details,'2026-11-01.1',repeat('b',64),'2026-10-29.1',null,null,'maker@example.test');
    raise exception 'FAIL: missing invitation accepted.';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    perform public.submit_artisan_application(f.application_id,f.details||'{"adult":false}'::jsonb,'2026-11-01.1',f.token,'2026-10-29.1',null,null,'maker@example.test');
    raise exception 'FAIL: underage application accepted.';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    perform public.submit_artisan_application(f.application_id,f.details||'{"consent":false}'::jsonb,'2026-11-01.1',f.token,'2026-10-29.1',null,null,'maker@example.test');
    raise exception 'FAIL: missing consent accepted.';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    perform public.submit_artisan_application(f.application_id,f.details||'{"portfolioUrl":"javascript:alert(1)"}'::jsonb,'2026-11-01.1',f.token,'2026-10-29.1',null,null,'maker@example.test');
    raise exception 'FAIL: unsafe portfolio accepted.';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    perform public.submit_artisan_application(f.application_id,f.details,'2026-11-01.1',f.token,applicant_email=>'maker@example.test');
    raise exception 'FAIL: dispatch terms not acknowledged.';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    perform public.submit_artisan_application(f.application_id,f.details,'2026-10-29',f.token,'2026-10-29.1',null,null,'maker@example.test');
    raise exception 'FAIL: old privacy notice accepted.';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    perform public.submit_artisan_application(f.application_id,f.details,'2026-11-01.1',f.token,'2026-10-29.1',null,null,'invalid-email');
    raise exception 'FAIL: invalid applicant email accepted.';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    perform public.submit_artisan_application(f.application_id,f.details,'2026-11-01.1',f.token,'old-terms',null,null,'maker@example.test');
    raise exception 'FAIL: old dispatch terms accepted.';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  result:=public.submit_artisan_application(f.application_id,f.details,'2026-11-01.1',f.token,'2026-10-29.1',null,null,'maker@example.test');
  if result<>f.application_id then raise exception 'FAIL: application receipt.'; end if;
  perform public.submit_artisan_application(f.application_id,f.details,'2026-11-01.1',f.token,'2026-10-29.1',null,null,'maker@example.test');
  begin
    perform public.submit_artisan_application(f.application_id,f.details,'2026-11-01.1',f.token,'2026-10-29.1',null,null,'changed@example.test');
    raise exception 'FAIL: idempotent retry changed applicant email.';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  result:=public.submit_artisan_application(f.legacy_application_id,f.details,'2026-10-29.2',f.legacy_token,'2026-10-29.1',null,null,null);
  if result<>f.legacy_application_id then raise exception 'FAIL: older cached application form cannot submit.'; end if;
  perform public.submit_artisan_application(f.legacy_application_id,f.details,'2026-10-29.2',f.legacy_token,'2026-10-29.1',null,null,null);
  if public.artisan_invitation_status(f.token)<>'submitted' then raise exception 'FAIL: submitted invitation not marked.'; end if;
  begin
    perform public.submit_artisan_application(gen_random_uuid(),f.details,'2026-11-01.1',f.token,'2026-10-29.1',null,null,'maker@example.test');
    raise exception 'FAIL: invitation reused.';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    perform 1 from public.artisan_applications;
    raise exception 'FAIL: applicant can read application directory.';
  exception when insufficient_privilege then null; end;
  if exists(select 1 from public.artisan_application_history) then raise exception 'FAIL: applicant can read history.'; end if;
  begin
    perform 1 from public.artisan_application_emails;
    raise exception 'FAIL: applicant can read email queue.';
  exception when insufficient_privilege then null; end;
  begin
    perform public.claim_artisan_application_emails();
    raise exception 'FAIL: applicant can claim email jobs.';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    perform public.list_artisan_applications();
    raise exception 'FAIL: applicant can list applications.';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    perform public.update_artisan_application(f.application_id,1,'Approved','');
    raise exception 'FAIL: applicant can approve self.';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.artisan_applications where id=(select application_id from artisan_fixture))<>1 then raise exception 'FAIL: duplicate application.'; end if;
  if not exists(select 1 from public.artisan_applications where id=(select legacy_application_id from artisan_fixture)
    and contact_email is null and consent_version='2026-10-29.2') then raise exception 'FAIL: older cached application form cannot submit.'; end if;
  if (select count(*) from public.artisan_application_emails where application_id=(select legacy_application_id from artisan_fixture)
    and kind='submitted' and recipient_email='info@luviacreations.com')<>1 then
    raise exception 'FAIL: legacy submission notification was not queued idempotently.'; end if;
  if (select count(*) from public.artisan_application_emails where application_id=(select application_id from artisan_fixture)
    and kind='submitted' and recipient_email='info@luviacreations.com')<>1 then raise exception 'FAIL: admin submission email was not queued exactly once.'; end if;
  if exists(select 1 from public.artisan_application_emails where application_id=(select application_id from artisan_fixture)
    and (payload ? 'address' or payload ? 'admin_notes')) then raise exception 'FAIL: private application fields copied to email queue.'; end if;
  if exists(select 1 from public.artisan_invitations where token_hash=(select token from artisan_fixture)) then raise exception 'FAIL: raw token stored.'; end if;
end $$;

select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal2','session_id',session_id,
  'amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from now())))))::text,true)
from artisan_fixture;
set local role authenticated;
do $$ declare f record; result jsonb; expired_id uuid:=gen_random_uuid(); revoked_id uuid:=gen_random_uuid(); begin
  select * into f from artisan_fixture;
  result:=public.list_artisan_applications('Crochet flowers','New',0);
  if not exists(select 1 from jsonb_array_elements(result->'applications') a where a->>'id'=f.application_id::text) then raise exception 'FAIL: filtered directory.'; end if;
  result:=public.update_artisan_application(f.application_id,1,'Contacted','Trial discussed');
  if result->>'status'<>'Contacted' or (result->>'version')::integer<>2 or result ? 'user_id' then raise exception 'FAIL: review receipt.'; end if;
  if (select count(*) from public.artisan_application_history where application_id=f.application_id)<>2 then raise exception 'FAIL: review audit.'; end if;
  result:=public.update_artisan_application(f.application_id,2,'More information required','Private admin note','Please share a link to your crochet portfolio.');
  if result->>'status'<>'More information required' or result->>'applicant_message'<>'Please share a link to your crochet portfolio.' then
    raise exception 'FAIL: applicant-facing review message was not saved.'; end if;
  result:=public.update_artisan_application(f.application_id,3,'More information required','Internal update',
    'Please also tell us which crochet hook sizes you have.');
  result:=public.list_artisan_applications('','More information required',0);
  if (result->>'total')::integer<>1 or result->'applications'->0->>'contact_email'<>'maker@example.test' then
    raise exception 'FAIL: new status or applicant email missing from admin directory.'; end if;
  result:=public.update_artisan_application(f.application_id,4,'Approved','Approval note');
  if result->>'status'<>'Approved' then raise exception 'FAIL: approval review receipt.'; end if;
  if (select count(*) from public.artisan_application_history where application_id=f.application_id)<>5 then raise exception 'FAIL: review history after email statuses.'; end if;
  begin
    perform public.update_artisan_application(f.application_id,1,'Approved','Stale');
    raise exception 'FAIL: stale review overwrote newer changes.';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  perform public.create_artisan_invitation(expired_id,repeat('c',64),'Expired','whatsapp','9876543210');
  perform public.create_artisan_invitation(revoked_id,repeat('d',64),'Revoked','whatsapp','9876543210');
  perform public.revoke_artisan_invitation(revoked_id);
  if exists(select 1 from public.artisan_invitations where id=revoked_id) then
    raise exception 'FAIL: revoked invitation remained in the database.'; end if;
  if public.artisan_invitation_status(repeat('d',64))<>'unavailable' then raise exception 'FAIL: revoked invitation available.'; end if;
end $$;
reset role;
do $$ declare f record; begin
  select * into f from artisan_fixture;
  if (select count(*) from public.artisan_application_emails where application_id=f.application_id
    and kind='More information required' and recipient_email='maker@example.test'
    and payload->>'message'='Please share a link to your crochet portfolio.'
    and not (payload ? 'admin_notes'))<>1 then raise exception 'FAIL: information request email not queued safely.'; end if;
  if (select count(*) from public.artisan_application_emails where application_id=f.application_id
    and kind='More information required' and recipient_email='maker@example.test')<>2 then
    raise exception 'FAIL: revised information request was not queued.'; end if;
  if (select count(*) from public.artisan_application_emails where application_id=f.application_id
    and kind='Approved' and recipient_email='maker@example.test')<>1 then raise exception 'FAIL: approval notification not queued.'; end if;
end $$;
update public.artisan_invitations set expires_at=now() where token_hash=encode(extensions.digest(repeat('c',64),'sha256'),'hex');
select public.purge_expired_artisan_invitations();
do $$ begin
  if exists(select 1 from public.artisan_invitations where token_hash=encode(extensions.digest(repeat('c',64),'sha256'),'hex')) then
    raise exception 'FAIL: expired invitation remained after cleanup.'; end if;
  if not exists(select 1 from public.artisan_invitations where id=(select invite_id from artisan_fixture)) then
    raise exception 'FAIL: cleanup removed an invitation with a submitted application.'; end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',applicant_id,'role','authenticated')::text,true) from artisan_fixture;
set local role authenticated;
do $$ declare f record; token text; begin
  select * into f from artisan_fixture;
  foreach token in array array[repeat('c',64),repeat('d',64)] loop
    if public.artisan_invitation_status(token)<>'unavailable' then raise exception 'FAIL: expired/revoked link available.'; end if;
    begin
      perform public.submit_artisan_application(gen_random_uuid(),f.details,'2026-11-01.1',token,'2026-10-29.1',null,null,'maker@example.test');
      raise exception 'FAIL: expired/revoked invitation accepted.';
    exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  end loop;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal1','session_id',session_id)::text,true) from artisan_fixture;
set local role authenticated;
do $$ begin
  begin
    perform public.list_artisan_applications();
    raise exception 'FAIL: password-only admin allowed.';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal2','session_id',session_id,
  'amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from now())))))::text,true)
from artisan_fixture;
set local role authenticated;
select public.delete_artisan_application(application_id,5) from artisan_fixture;
select public.delete_artisan_application(legacy_application_id,1) from artisan_fixture;
reset role;
do $$ begin
  if exists(select 1 from public.artisan_application_history where application_id=(select application_id from artisan_fixture))
    or exists(select 1 from public.artisan_application_history where application_id=(select legacy_application_id from artisan_fixture))
    or exists(select 1 from public.artisan_invitations where id=(select invite_id from artisan_fixture))
    or exists(select 1 from public.artisan_invitations where id=(select legacy_invite_id from artisan_fixture))
    or exists(select 1 from public.artisan_application_emails where application_id=(select application_id from artisan_fixture))
    or exists(select 1 from public.artisan_application_emails where application_id=(select legacy_application_id from artisan_fixture))
    then raise exception 'FAIL: deletion left linked personal records.'; end if;
end $$;
rollback;
