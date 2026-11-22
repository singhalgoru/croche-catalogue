-- Rollback-only checks; run against a migrated isolated TEST database.
begin;
create temporary table work_fixture as select gen_random_uuid() admin_id,gen_random_uuid() session_id,
  gen_random_uuid() factor_id,gen_random_uuid() product_id,gen_random_uuid() invitation_id,gen_random_uuid() artisan_id,
  gen_random_uuid() revision,gen_random_uuid() assignment_id;
grant select on work_fixture to authenticated,anon,service_role;
insert into auth.users(id) select admin_id from work_fixture;
insert into public.catalogue_admins(user_id) select admin_id from work_fixture;
insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at,secret)
  select factor_id,admin_id,'totp','verified',now(),now(),'fixture' from work_fixture;
insert into auth.sessions(id,user_id,factor_id,aal,created_at,updated_at)
  select session_id,admin_id,factor_id,'aal2',now(),now() from work_fixture;
insert into public.products(id,name,category,description,color,image_path,image_url,created_by,published)
  select product_id,'Synthetic Headband','Toys','Synthetic product.','#f6c453','work-test.webp',
    'https://example.test/work.webp',admin_id,false from work_fixture;
insert into public.artisan_invitations(id,token_hash,recipient_name,channel,contact)
  select invitation_id,invitation_id::text,'Synthetic Maker','email','maker@example.test' from work_fixture;
insert into public.artisan_applications(id,invitation_id,details,consent_version,status,contact_email)
  select artisan_id,invitation_id,'{"fullName":"Synthetic Maker"}'::jsonb,'2026-11-01.1','Approved','maker@example.test' from work_fixture;
insert into public.product_patterns(product_id,revision,filename,content,pdf_filename,pdf_content,language)
  select product_id,revision,'Headband.docx',decode('504b0304','hex')||convert_to(repeat('pattern',20),'UTF8'),
    'Headband.pdf',convert_to('%PDF-1.7 '||repeat('pattern',20),'UTF8'),'en' from work_fixture;
do $$ begin
  if has_table_privilege('anon','public.artisan_work_assignments','SELECT')
    or has_table_privilege('authenticated','public.artisan_work_attachments','SELECT')
    or has_function_privilege('anon','public.create_artisan_work_assignment(uuid,uuid,jsonb)','EXECUTE')
    or has_function_privilege('authenticated','public.claim_artisan_work_emails()','EXECUTE')
    or has_function_privilege('authenticated','public.create_artisan_work_assignment_base(uuid,uuid,jsonb)','EXECUTE') then
    raise exception 'FAIL: private work data or admin functions exposed.';
  end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal2','session_id',session_id,
  'amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from now())))))::text,true) from work_fixture;
set local role authenticated;
do $$
declare f record; draft jsonb; legacy jsonb; legacy_id uuid := gen_random_uuid();
begin
  select * into f from work_fixture;
  draft:=jsonb_build_object('recipientName','Synthetic Maker','recipientEmail','maker@example.test',
    'subject','Test offer','message','Please review.','deliveryDate','2099-12-01','courierCap',100,'advancePercent',25,
    'items',jsonb_build_array(jsonb_build_object('productId',f.product_id,'name','Synthetic Headband','quantity',2,
      'rate',150,'yarnBasis','with','patternRevision',f.revision),
      jsonb_build_object('productId',null,'name','Custom flower','quantity',1,'rate',30,'yarnBasis','without','patternRevision',null)));
  legacy := jsonb_set(draft,'{items,0}',((draft->'items'->0) - 'rate') || '{"rateWithYarn":150,"rateWithoutYarn":100}'::jsonb);
  perform public.create_artisan_work_assignment(legacy_id,f.artisan_id,legacy);
  perform public.create_artisan_work_assignment(legacy_id,f.artisan_id,legacy);
  begin
    perform public.create_artisan_work_assignment(gen_random_uuid(),f.artisan_id,jsonb_set(draft,'{items,0,rate}','-1'));
    raise exception 'FAIL: negative rate accepted.';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    perform public.create_artisan_work_assignment(gen_random_uuid(),f.artisan_id,jsonb_set(draft,'{items,0,rateWithYarn}','150'));
    raise exception 'FAIL: ambiguous rate accepted.';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    perform public.create_artisan_work_assignment(gen_random_uuid(),f.artisan_id,jsonb_set(draft,'{advancePercent}','101'));
    raise exception 'FAIL: invalid advance accepted.';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    perform public.create_artisan_work_assignment(gen_random_uuid(),f.artisan_id,jsonb_set(draft,'{items,0,yarnBasis}','"invalid"'));
    raise exception 'FAIL: invalid rate basis accepted.';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  perform public.create_artisan_work_assignment(f.assignment_id,f.artisan_id,draft);
  perform public.create_artisan_work_assignment(f.assignment_id,f.artisan_id,draft);
  begin
    perform public.create_artisan_work_assignment(f.assignment_id,f.artisan_id,jsonb_set(draft,'{courierCap}','101'));
    raise exception 'FAIL: changed request replay accepted.';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    perform public.complete_artisan_work_assignment(f.assignment_id);
    raise exception 'FAIL: unaccepted assignment completed.';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
end $$;
reset role;
create temporary table work_token as select token from public.artisan_work_emails where assignment_id=(select assignment_id from work_fixture) and kind='offer';
grant select on work_token to anon;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
do $$
declare candidate jsonb; claimed jsonb;
begin
  claimed:=public.claim_artisan_work_emails();
  select value into candidate from jsonb_array_elements(claimed)
    where value->>'id'=(select assignment_id::text from work_fixture) and value->>'kind'='offer';
  if candidate is null or jsonb_array_length(candidate->'attachments')<>1
    or candidate->'attachments'->0->>'filename'<>'Headband.pdf'
    or candidate->'attachments'->0->>'content'<>replace(encode(convert_to('%PDF-1.7 '||repeat('pattern',20),'UTF8'),'base64'),E'\n','')
    then raise exception 'FAIL: selected PDF not included in claimed email.'; end if;
end $$;
reset role;
select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
do $$
declare result jsonb; token text;
begin
  select t.token into token from work_token t;
  result:=public.read_artisan_work_assignment(token);
  if result->'acceptedAt'<>'null'::jsonb or jsonb_array_length(result->'offer'->'items')<>2
    or result->'offer'->'items'->0->>'patternFilename'<>'Headband.pdf'
    or result->'offer'->'items'->0->>'yarnBasis'<>'with'
    or result->'offer'->'items'->1->>'yarnBasis'<>'without'
    or (result->'offer'->'items'->0->>'rate')::numeric<>150
    or result->'offer'->'items'->0 ? 'rateWithYarn'
    or result->'offer'->'items'->0 ? 'rateWithoutYarn'
    or (result->'offer'->>'advancePercent')::numeric<>25
    or result->'offer'->>'qualityTerms' <> 'Delivered products must meet the quality standards agreed before work begins. Products that do not meet those standards may be rejected and will be returned after the advance payment is returned. Luvia will bear the return shipment courier charges.'
    then raise exception 'FAIL: offer snapshot incorrect.'; end if;
  perform public.accept_artisan_work_assignment(token);
  perform public.accept_artisan_work_assignment(token);
end $$;
reset role;
do $$ begin
  if (select count(*) from public.artisan_work_emails where assignment_id=(select assignment_id from work_fixture) and kind='acceptance')<>1 then
    raise exception 'FAIL: acceptance confirmation duplicated.';
  end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal2','session_id',session_id,
  'amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from now())))))::text,true) from work_fixture;
set local role authenticated;
do $$
declare f record; result jsonb;
begin
  select * into f from work_fixture;
  select value into result from jsonb_array_elements(public.list_artisan_work_assignments(f.artisan_id)) where value->>'id'=f.assignment_id::text;
  if result->'acceptedAt'='null'::jsonb or result->'completedAt'<>'null'::jsonb then raise exception 'FAIL: work in progress missing.'; end if;
  perform public.complete_artisan_work_assignment(f.assignment_id);
  select value into result from jsonb_array_elements(public.list_artisan_work_assignments(f.artisan_id)) where value->>'id'=f.assignment_id::text;
  if result->'completedAt'='null'::jsonb then raise exception 'FAIL: completion missing.'; end if;
end $$;
reset role;
rollback;
