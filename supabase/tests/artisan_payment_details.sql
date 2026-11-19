begin;
create temporary table payment_fixture as select gen_random_uuid() admin_id,gen_random_uuid() session_id,
  gen_random_uuid() factor_id,gen_random_uuid() invite_id,gen_random_uuid() application_id;
grant select on payment_fixture to authenticated,anon;
insert into auth.users(id) select admin_id from payment_fixture;
insert into public.catalogue_admins(user_id) select admin_id from payment_fixture;
insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at,secret)
  select factor_id,admin_id,'totp','verified',now(),now(),'fixture' from payment_fixture;
insert into auth.sessions(id,user_id,factor_id,aal,created_at,updated_at)
  select session_id,admin_id,factor_id,'aal2',now(),now() from payment_fixture;
insert into public.artisan_invitations(id,token_hash,recipient_name,channel,contact)
  select invite_id,encode(extensions.digest(invite_id::text,'sha256'),'hex'),'Sample Maker','email','maker@example.test' from payment_fixture;
insert into public.artisan_applications(id,invitation_id,details,consent_version,contact_email)
  select application_id,invite_id,'{"fullName":"Sample Maker","mobile":"9876543210","city":"Test","state":"Test","skills":"Test","availability":"Test"}',
    'fixture','maker@example.test' from payment_fixture;
select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal2','session_id',session_id,
  'amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from now())))))::text,true)
from payment_fixture;
set local role authenticated;
do $$ declare id uuid; begin
  select application_id into id from payment_fixture;
  begin
    perform public.update_artisan_application(id,1,'Trial','','');
    raise exception 'FAIL: Trial started without payment details';
  exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
  perform public.request_artisan_payment_details(id);
  if not (public.artisan_payment_status(id)->>'requested')::boolean then raise exception 'FAIL: no request'; end if;
  begin
    perform public.request_artisan_payment_details(id);
    raise exception 'FAIL: duplicate request';
  exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    perform 1 from public.artisan_payment_details;
    raise exception 'FAIL: sensitive table readable';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
create temporary table payment_token as
  select payload->>'payment_token' token from public.artisan_application_emails
  where application_id=(select application_id from payment_fixture) and kind='Payment details required';
grant select on payment_token to anon;
update public.artisan_applications set status='Declined' where id=(select application_id from payment_fixture);
set local role anon;
do $$ begin
  begin
    perform public.submit_artisan_payment_details((select token from payment_token),'{"name":"Sample Maker","method":"UPI","upi":"maker@bank"}',true);
    raise exception 'FAIL: declined application accepted payment details';
  exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
end $$;
reset role;
update public.artisan_applications set status='New' where id=(select application_id from payment_fixture);
set local role anon;
do $$ declare token text; begin
  select payment_token.token into token from payment_token;
  begin
    perform public.submit_artisan_payment_details(token,'{"name":"Sample Maker","method":"Bank transfer","account":1234567890,"ifsc":"ABCD0123456"}',true);
    raise exception 'FAIL: non-string account accepted';
  exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
  perform public.submit_artisan_payment_details(token,'{"name":"Sample Maker","method":"UPI","upi":"maker@bank"}',true);
  begin
    perform public.submit_artisan_payment_details(token,'{"name":"Sample Maker","method":"UPI","upi":"maker@bank"}',true);
    raise exception 'FAIL: token reused';
  exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
end $$;
reset role;
set local role authenticated;
do $$ declare id uuid; saved jsonb; begin
  select application_id into id from payment_fixture;
  if (public.artisan_payment_status(id)->>'verified')::boolean then raise exception 'FAIL: submission auto-confirmed'; end if;
  begin
    perform public.save_artisan_payment_details(id,'{"name":"Other Person","method":"UPI","upi":"maker@bank"}',true);
    raise exception 'FAIL: different holder accepted';
  exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
  saved:=public.read_artisan_payment_details(id);
  if saved->'details'->>'upi'<>'maker@bank' then raise exception 'FAIL: submitted details unavailable'; end if;
  perform public.save_artisan_payment_details(id,'{"name":"Sample Maker","method":"Bank transfer","account":"1234567890","ifsc":"ABCD0123456"}',true);
  saved:=public.read_artisan_payment_details(id);
  if saved->'details'->>'account'<>'1234567890' or not (saved->>'verified')::boolean then raise exception 'FAIL: manual update'; end if;
  perform public.update_artisan_application(id,1,'Trial','','');
end $$;
reset role;
do $$ begin
  if exists(select 1 from public.artisan_payment_details where encode(encrypted_details,'escape') like '%1234567890%')
    then raise exception 'FAIL: plaintext account stored'; end if;
end $$;
rollback;
