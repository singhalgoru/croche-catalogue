begin;
create temporary table profile_fixture as select gen_random_uuid() admin_id,gen_random_uuid() applicant_id,
  gen_random_uuid() session_id,gen_random_uuid() factor_id,gen_random_uuid() invite_id,gen_random_uuid() application_id,
  gen_random_uuid() comment_id,gen_random_uuid() payment_id,repeat('f',64) token,
  '{"fullName":"Synthetic Profile Fixture परीक्षण","address":"परीक्षण गली","mobile":"9876543210","city":"गुरुग्राम","state":"हरियाणा","pin":"122001",
    "language":"हिन्दी, शाम को","skills":"Crochet flowers और अमिगुरुमी","availability":"हर सप्ताह 5 घंटे","experience":"","tools":"",
    "portfolioUrl":"","notes":"","adult":true,"consent":true,"paidTrial":true}'::jsonb details,
  jsonb_build_object('contentType','image/webp','consent',true,'consentVersion','2026-10-30.1',
    'data',encode(decode('52494646080000005745425056503820','hex'),'base64')) photo;
grant select on profile_fixture to authenticated,anon;
insert into auth.users(id) select admin_id from profile_fixture;
insert into auth.users(id,is_anonymous) select applicant_id,true from profile_fixture;
insert into public.catalogue_admins(user_id) select admin_id from profile_fixture;
insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at,secret)
select factor_id,admin_id,'totp','verified',now(),now(),'fixture' from profile_fixture;
insert into auth.sessions(id,user_id,factor_id,aal,created_at,updated_at)
select session_id,admin_id,factor_id,'aal2',now(),now() from profile_fixture;
select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal2','session_id',session_id,
  'amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from now())))))::text,true) from profile_fixture;
set local role authenticated;
select public.create_artisan_invitation(invite_id,token,'Synthetic Profile Fixture','whatsapp','9876543210') from profile_fixture;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',applicant_id,'role','authenticated')::text,true) from profile_fixture;
set local role authenticated;
do $$ declare f record; bad jsonb; begin
  select * into f from profile_fixture;
  foreach bad in array array[f.photo||'{"consent":false}'::jsonb,f.photo||'{"consentVersion":"old"}'::jsonb,
    f.photo||'{"contentType":"text/html"}'::jsonb,f.photo||'{"data":"aGVsbG8="}'::jsonb] loop
    begin
      perform public.submit_artisan_application(f.application_id,f.details,'2026-10-29.2',f.token,'2026-10-29.1',null,bad);
      raise exception 'FAIL: invalid profile photo accepted.';
    exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  end loop;
  perform public.submit_artisan_application(f.application_id,f.details,'2026-10-29.2',f.token,'2026-10-29.1',null,f.photo);
  perform public.submit_artisan_application(f.application_id,f.details,'2026-10-29.2',f.token,'2026-10-29.1',null,f.photo);
  begin
    perform public.submit_artisan_application(f.application_id,f.details||'{"address":"changed"}'::jsonb,'2026-10-29.2',f.token,'2026-10-29.1',null,f.photo);
    raise exception 'FAIL: replay changed delivery address.';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    perform public.submit_artisan_application_core(f.application_id,f.details-'address','2026-10-29.2',f.token,'2026-10-29.1',null);
    raise exception 'FAIL: applicant can bypass new submission wrapper.';
  exception when insufficient_privilege then null; end;
  begin
    perform public.artisan_activity(f.application_id); raise exception 'FAIL: applicant read profile activity.';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    perform public.read_artisan_profile_photo(f.application_id); raise exception 'FAIL: applicant read profile photo.';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    perform public.record_artisan_payment(f.application_id,f.payment_id,current_date,100,'Cash','','Trial');
    raise exception 'FAIL: applicant recorded payment.';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.artisan_profile_photos where application_id=(select application_id from profile_fixture))<>1 then raise exception 'FAIL: photo not stored exactly once.'; end if;
  if not exists(select 1 from public.artisan_applications where id=(select application_id from profile_fixture)
    and delivery_address='परीक्षण गली' and has_profile_photo and skill_rating is null) then raise exception 'FAIL: profile not populated.'; end if;
  if current_setting('server_encoding') <> 'UTF8' then raise exception 'FAIL: database is not UTF8.'; end if;
  if not exists(select 1 from public.artisan_applications a, profile_fixture f where a.id=f.application_id
    and a.details=f.details-'address') then
    raise exception 'FAIL: original Hindi answers changed.'; end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal1','session_id',session_id)::text,true) from profile_fixture;
set local role authenticated;
do $$ begin
  begin
    perform public.save_artisan_skills((select application_id from profile_fixture),1,4,'Amigurumi');
    raise exception 'FAIL: non-MFA admin edited skills.';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal2','session_id',session_id,
  'amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from now())))))::text,true) from profile_fixture;
set local role authenticated;
do $$ declare f record; result jsonb; bad numeric; begin
  select * into f from profile_fixture;
  result:=public.save_artisan_skills(f.application_id,1,4,'Amigurumi toys and bags');
  if (result->>'version')::integer<>2 or (result->>'skill_rating')::integer<>4 then raise exception 'FAIL: skills not saved.'; end if;
  begin
    perform public.save_artisan_skills(f.application_id,1,5,'stale'); raise exception 'FAIL: stale review accepted.';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    perform public.save_artisan_skills(f.application_id,2,6,'bad'); raise exception 'FAIL: rating above five.';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  result:=public.list_artisan_applications('Synthetic Profile Fixture','',0,'amigurumi',4);
  if (result->>'total')::integer<>1 then raise exception 'FAIL: combined skills/rating filter missed artisan.'; end if;
  if (public.list_artisan_applications('Synthetic Profile Fixture','',0,'flowers',5)->>'total')::integer<>0 then raise exception 'FAIL: rating filter ignored.'; end if;
  if (public.list_artisan_applications('Synthetic Profile Fixture','',0,'flowers',null)->>'total')::integer<>1 then raise exception 'FAIL: original application skills not searchable.'; end if;
  result:=public.list_artisan_applications('परीक्षण','',0,'अमिगुरुमी',null);
  if (result->>'total')::integer<>1 or result->'applications'->0->'details' <> f.details-'address' then
    raise exception 'FAIL: Hindi search or admin response changed original answers.'; end if;
  result:=public.read_artisan_profile_photo(f.application_id);
  if result->>'data'<>f.photo->>'data' then raise exception 'FAIL: photo differs.'; end if;
  perform public.add_artisan_comment(f.application_id,f.comment_id,'Strong trial stitches');
  perform public.add_artisan_comment(f.application_id,f.comment_id,'Strong trial stitches');
  foreach bad in array array[-1,0,1.001,10000001,'NaN'::numeric,'Infinity'::numeric] loop
    begin
      perform public.record_artisan_payment(f.application_id,f.payment_id,current_date,bad,'Cash','','Trial');
      raise exception 'FAIL: invalid payment amount accepted.';
    exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  end loop;
  begin
    perform public.record_artisan_payment(f.application_id,f.payment_id,current_date,100,'UPI','','Trial');
    raise exception 'FAIL: noncash payment without reference.';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    perform public.record_artisan_payment(f.application_id,f.payment_id,current_date+2,100,'Cash','','Trial');
    raise exception 'FAIL: future payment accepted.';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  perform public.record_artisan_payment(f.application_id,f.payment_id,current_date,125.50,'UPI','synthetic-ref','Paid trial');
  perform public.record_artisan_payment(f.application_id,f.payment_id,current_date,125.50,'UPI','synthetic-ref','Paid trial');
  begin
    perform public.record_artisan_payment(f.application_id,f.payment_id,current_date,200,'UPI','synthetic-ref','Paid trial');
    raise exception 'FAIL: changed payment replay accepted.';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  result:=public.artisan_activity(f.application_id);
  if jsonb_array_length(result->'comments')<>1 or jsonb_array_length(result->'payments')<>1
    or (result->'payments'->0->>'amount')::numeric<>125.50 then raise exception 'FAIL: ledger duplicated/lost payment or comment.'; end if;
  perform public.void_artisan_payment(f.payment_id,'Wrong batch reference');
  result:=public.artisan_activity(f.application_id);
  if result->'payments'->0->>'void_reason'<>'Wrong batch reference' or result->'payments'->0->>'voided_at' is null then raise exception 'FAIL: void lost audit.'; end if;
  begin
    perform public.delete_artisan_application(f.application_id,2); raise exception 'FAIL: payment history deleted.';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  perform public.remove_artisan_profile_photo(f.application_id,2);
end $$;
reset role;
do $$ begin
  if exists(select 1 from public.artisan_profile_photos where application_id=(select application_id from profile_fixture)) then raise exception 'FAIL: removed photo remains.'; end if;
  if not exists(select 1 from public.artisan_applications where id=(select application_id from profile_fixture) and not has_profile_photo and version=3) then raise exception 'FAIL: removal version incorrect.'; end if;
  if (select count(*) from public.artisan_payments where application_id=(select application_id from profile_fixture))<>1 then raise exception 'FAIL: payment history not retained.'; end if;
end $$;
set local role anon;
do $$ begin
  begin perform 1 from public.artisan_profile_photos; raise exception 'FAIL: public photo access.'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.artisan_comments; raise exception 'FAIL: public comments access.'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.artisan_payments; raise exception 'FAIL: public payments access.'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
