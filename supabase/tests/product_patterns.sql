-- Rollback-only checks; run against a migrated TEST database.
begin;
create temporary table pattern_fixture as select gen_random_uuid() admin_id,gen_random_uuid() session_id,
  gen_random_uuid() factor_id,gen_random_uuid() product_id,gen_random_uuid() invitation_id,gen_random_uuid() artisan_id,
  gen_random_uuid() revision,gen_random_uuid() replacement,gen_random_uuid() email_id,
  encode(decode('504b0304','hex')||convert_to(repeat('pattern',20),'UTF8'),'base64') document_data,
  replace(encode(convert_to('%PDF-1.7 /Encrypt 1 0 R /P -1852 '||repeat('pdf',40),'UTF8'),'base64'),E'\n','') pdf_data;
grant select on pattern_fixture to authenticated,anon,service_role;
insert into auth.users(id) select admin_id from pattern_fixture;
insert into public.catalogue_admins(user_id) select admin_id from pattern_fixture;
insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at,secret)
  select factor_id,admin_id,'totp','verified',now(),now(),'fixture' from pattern_fixture;
insert into auth.sessions(id,user_id,factor_id,aal,created_at,updated_at)
  select session_id,admin_id,factor_id,'aal2',now(),now() from pattern_fixture;
insert into public.products(id,name,category,description,color,image_path,image_url,created_by,published)
  select product_id,'Synthetic Pattern Fixture','Toys','Synthetic test-only crochet pattern product.','#f6c453',
    'test-pattern-'||product_id||'.webp','https://example.test/pattern.webp',admin_id,false from pattern_fixture;
insert into public.artisan_invitations(id,token_hash,recipient_name,channel,contact)
  select invitation_id,invitation_id::text,'Synthetic Maker','email','maker@example.test' from pattern_fixture;
insert into public.artisan_applications(id,invitation_id,details,consent_version,status,contact_email)
  select artisan_id,invitation_id,'{"fullName":"Synthetic Maker"}'::jsonb,'2026-11-01.1','Approved','maker@example.test' from pattern_fixture;
update pattern_fixture set document_data=replace(document_data,E'\n','');
do $$ begin
  if has_table_privilege('anon','public.product_patterns','SELECT')
    or has_table_privilege('authenticated','public.product_patterns','SELECT')
    or has_table_privilege('authenticated','public.product_pattern_emails','INSERT')
    or has_function_privilege('anon','public.product_pattern_workspace(uuid)','EXECUTE')
    or has_function_privilege('authenticated','public.claim_product_pattern_emails()','EXECUTE') then
    raise exception 'FAIL: private pattern access exposed.';
  end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal1')::text,true) from pattern_fixture;
set local role authenticated;
do $$ begin
  begin
    perform public.product_pattern_workspace((select product_id from pattern_fixture));
    raise exception 'FAIL: non-MFA admin read patterns.';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal2','session_id',session_id,
  'amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from now())))))::text,true) from pattern_fixture;
set local role authenticated;
do $$
declare f record; workspace jsonb; bad text;
begin
  select * into f from pattern_fixture;
  foreach bad in array array['macro.docm','../path.docx','bad'||chr(10)||'.docx'] loop
    begin
      perform public.save_product_pattern(f.product_id,null,f.revision,bad,f.document_data,'Lotus.pdf',f.pdf_data,'en');
      raise exception 'FAIL: invalid filename accepted.';
    exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  end loop;
  begin
    perform public.save_product_pattern(f.product_id,null,f.revision,'Bad.docx',encode(convert_to(repeat('bad',100),'UTF8'),'base64'),'Lotus.pdf',f.pdf_data,'en');
    raise exception 'FAIL: invalid Word signature accepted.';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    perform public.save_product_pattern(f.product_id,null,f.revision,'Lotus.docx',f.document_data,'Lotus.pdf',
      encode(convert_to('%PDF-1.7 /Encrypt 1 0 R /P -1836 '||repeat('pdf',40),'UTF8'),'base64'),'en');
    raise exception 'FAIL: copying-enabled PDF accepted.';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  perform public.save_product_pattern(f.product_id,null,f.revision,'Lotus.docx',f.document_data,'Lotus.pdf',f.pdf_data,'hi');
  perform public.save_product_pattern(f.product_id,null,f.revision,'Lotus.docx',f.document_data,'Lotus.pdf',f.pdf_data,'hi');
  workspace:=public.product_pattern_workspace(f.product_id);
  if workspace->'pattern'->>'filename'<>'Lotus.docx'
    or not exists(select 1 from jsonb_array_elements(workspace->'recipients') r where r->>'id'=f.artisan_id::text)
    or jsonb_array_length(workspace->'emails')<>0 or workspace->'pattern' ? 'content' then
    raise exception 'FAIL: incorrect pattern metadata, recipients or upload sent email.';
  end if;
  if public.read_product_pattern(f.product_id,f.revision)->>'data'<>f.document_data then raise exception 'FAIL: document bytes changed.'; end if;
  if public.read_product_pattern_pdf(f.product_id,f.revision)->>'data'<>f.pdf_data then raise exception 'FAIL: PDF bytes changed.'; end if;
  perform public.queue_product_pattern_email(f.product_id,f.revision,f.artisan_id,f.email_id,'Please review');
  perform public.queue_product_pattern_email(f.product_id,f.revision,f.artisan_id,f.email_id,'Please review');
  begin
    perform public.queue_product_pattern_email(f.product_id,f.revision,f.artisan_id,f.email_id,'Changed');
    raise exception 'FAIL: replay modified email.';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  perform public.save_product_pattern(f.product_id,f.revision,f.replacement,'Lotus-v2.docx',f.document_data,'Lotus-v2.pdf',f.pdf_data,'hi');
  begin
    perform public.queue_product_pattern_email(f.product_id,f.revision,f.artisan_id,gen_random_uuid(),'');
    raise exception 'FAIL: stale pattern shared.';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    perform public.remove_product_pattern(f.product_id,f.revision);
    raise exception 'FAIL: stale revision removed replacement.';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
end $$;
reset role;
do $$ declare f record; begin
  select * into f from pattern_fixture;
  if (select count(*) from public.product_pattern_emails where id=f.email_id)<>1
    or not exists(select 1 from public.product_pattern_emails where id=f.email_id and filename='Lotus.pdf'
      and revision=f.revision and content=decode(f.pdf_data,'base64') and language='hi') then
    raise exception 'FAIL: email not deduplicated or queued attachment changed on replacement.';
  end if;
  update public.artisan_applications set status='Trial' where id=f.artisan_id;
end $$;
set local role authenticated;
do $$ declare f record; begin
  select * into f from pattern_fixture;
  if exists(select 1 from jsonb_array_elements(public.product_pattern_workspace(f.product_id)->'recipients') r
    where r->>'id'=f.artisan_id::text) then raise exception 'FAIL: Trial recipient included.'; end if;
  begin
    perform public.queue_product_pattern_email(f.product_id,f.replacement,f.artisan_id,gen_random_uuid(),'');
    raise exception 'FAIL: non-Approved artisan received pattern.';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
end $$;
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
update public.product_pattern_emails set next_attempt_at=now()+interval '1 day'
  where id<>(select email_id from pattern_fixture);
do $$ declare jobs jsonb; f record; begin
  select * into f from pattern_fixture;
  jobs:=public.claim_product_pattern_emails();
  if exists(select 1 from jsonb_array_elements(jobs) j where j->>'id'=f.email_id::text) then
    raise exception 'FAIL: queued email claimed after artisan lost Approved status.';
  end if;
  if not exists(select 1 from public.product_pattern_emails where id=f.email_id and attempts=8 and content is null) then
    raise exception 'FAIL: ineligible queued email not stopped.';
  end if;
  update public.artisan_applications set status='Approved' where id=f.artisan_id;
  update public.product_pattern_emails set attempts=1,first_attempt_at=now()-interval '24 hours',
    content=decode(f.pdf_data,'base64') where id=f.email_id;
  jobs:=public.claim_product_pattern_emails();
  if not exists(select 1 from public.product_pattern_emails where id=f.email_id and attempts=8 and last_error like 'Retry window expired%') then
    raise exception 'FAIL: provider idempotency expiry ignored.';
  end if;
  update public.product_pattern_emails set attempts=0,first_attempt_at=null,next_attempt_at=now(),last_error=null where id=f.email_id;
  jobs:=public.claim_product_pattern_emails();
  if not exists(select 1 from jsonb_array_elements(jobs) j where j->>'id'=f.email_id::text and j->>'data'=f.pdf_data) then
    raise exception 'FAIL: worker did not receive original protected PDF attachment.';
  end if;
  jobs:=public.claim_product_pattern_emails();
  if exists(select 1 from jsonb_array_elements(jobs) j where j->>'id'=f.email_id::text) then raise exception 'FAIL: active claim delivered twice.'; end if;
end $$;
reset role;
rollback;
