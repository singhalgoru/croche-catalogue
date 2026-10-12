begin;
create temporary table mfa_fixture as select gen_random_uuid() user_id,gen_random_uuid() session_id,gen_random_uuid() factor_id;
grant select on mfa_fixture to authenticated;
insert into auth.users(id) select user_id from mfa_fixture;
insert into public.catalogue_admins(user_id) select user_id from mfa_fixture;
insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at,secret)
select factor_id,user_id,'totp','verified',now(),now(),'fixture' from mfa_fixture;
insert into auth.sessions(id,user_id,factor_id,aal,created_at,updated_at)
select session_id,user_id,factor_id,'aal2',now(),now() from mfa_fixture;
select set_config('request.jwt.claims',jsonb_build_object('sub',user_id,'role','authenticated','aal','aal1','session_id',session_id)::text,true)
from mfa_fixture;
set local role authenticated;
do $$ begin
  if coalesce(public.is_catalogue_admin(),false) then raise exception 'FAIL: password-only access permitted.'; end if;
  if not (public.admin_access_status()->>'isAdmin')::boolean then raise exception 'FAIL: cannot bootstrap MFA.'; end if;
  if (public.admin_access_status()->>'verified')::boolean then raise exception 'FAIL: password bootstrap grants privileges.'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',user_id,'role','authenticated','session_id',session_id)::text,true)
from mfa_fixture;
set local role authenticated;
do $$ declare denied boolean:=false; begin
  if public.is_catalogue_admin() is distinct from false then raise exception 'FAIL: missing assurance did not fail closed.'; end if;
  begin
    insert into public.ticker_messages(message,is_active,sort_order) values('MFA fixture message',false,0);
  exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'FAIL: password-only ticker write permitted.'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',user_id,'role','authenticated','aal','aal2','session_id',session_id,
  'amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from now())))))::text,true)
from mfa_fixture;
set local role authenticated;
do $$ declare ticker_id uuid; denied boolean:=false; begin
  if not public.is_catalogue_admin() then raise exception 'FAIL: verified MFA rejected.'; end if;
  insert into public.ticker_messages(message,is_active,sort_order) values('MFA fixture message',false,0) returning id into ticker_id;
  update public.ticker_messages set message='Updated MFA fixture' where id=ticker_id;
  delete from public.ticker_messages where id=ticker_id;
  if (select count(*) from public.admin_catalogue_audit where actor_id=auth.uid() and table_name='ticker_messages')<>3 then
    raise exception 'FAIL: ticker audit history incomplete.';
  end if;
  if not exists(select 1 from public.admin_catalogue_audit where actor_id=auth.uid() and action='DELETE'
    and old_record->>'message'='Updated MFA fixture') then raise exception 'FAIL: deleted ticker content not preserved.'; end if;
  begin delete from public.admin_catalogue_audit where actor_id=auth.uid();
  exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'FAIL: admin can erase audit history.'; end if;
end $$;
reset role;
update public.admin_security_settings set locked=true;
set local role authenticated;
do $$ begin
  if public.is_catalogue_admin() then raise exception 'FAIL: emergency lock bypassed.'; end if;
end $$;
reset role;
update public.admin_security_settings set locked=false;
update auth.mfa_factors set status='unverified' where id=(select factor_id from mfa_fixture);
set local role authenticated;
do $$ begin
  if public.is_catalogue_admin() then raise exception 'FAIL: removed verification factor permitted.'; end if;
end $$;
reset role;
update auth.mfa_factors set status='verified' where id=(select factor_id from mfa_fixture);
select set_config('request.jwt.claims',jsonb_build_object('sub',user_id,'role','authenticated','aal','aal2','session_id',session_id,
  'amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from now()-interval '16 minutes')))))::text,true)
from mfa_fixture;
set local role authenticated;
do $$ begin
  if public.is_catalogue_admin() then raise exception 'FAIL: stale verification permitted.'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',user_id,'role','authenticated','aal','aal2','session_id',session_id,
  'amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from now())))))::text,true)
from mfa_fixture;
delete from auth.sessions where id=(select session_id from mfa_fixture);
set local role authenticated;
do $$ begin
  if public.is_catalogue_admin() then raise exception 'FAIL: revoked session permitted.'; end if;
end $$;
reset role;
rollback;
