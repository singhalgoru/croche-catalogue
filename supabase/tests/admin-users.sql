begin;
create temporary table admin_fixture as select gen_random_uuid() as owner,gen_random_uuid() as member,gen_random_uuid() as customer;
grant select on admin_fixture to authenticated,service_role;
update public.catalogue_admins set is_owner=false where is_owner;
insert into auth.users(id,email,email_confirmed_at,is_anonymous)
select owner,owner||'@example.invalid',now(),false from admin_fixture union all
select member,member||'@example.invalid',now(),false from admin_fixture union all
select customer,customer||'@example.invalid',now(),false from admin_fixture;
insert into public.catalogue_admins(user_id,is_owner) select owner,true from admin_fixture;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
do $$ declare f record; result jsonb; rejected boolean:=false; begin
  select * into f from admin_fixture;
  perform public.manage_admin_membership(f.owner,f.member,true);
  result:=public.admin_user_directory(f.member);
  if (result->>'isOwner')::boolean or jsonb_array_length(result->'users')<>1 then
    raise exception 'FAIL: regular admin sees owner directory.';
  end if;
  begin perform public.manage_admin_membership(f.member,f.customer,true);
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'FAIL: regular admin granted access.'; end if;
  rejected:=false;
  begin perform public.manage_admin_membership(f.owner,f.owner,false);
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'FAIL: owner removed.'; end if;
  if public.find_admin_candidate(f.owner,f.customer||'@example.invalid')<>f.customer then raise exception 'FAIL: account lookup.'; end if;
  perform public.manage_admin_membership(f.owner,f.member,false);
  if (select count(*) from public.admin_user_audit where target_id=f.member)<>2 then raise exception 'FAIL: audit missing.'; end if;
  rejected:=false;
  begin perform public.admin_user_directory(f.member);
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'FAIL: removed admin still authorized.'; end if;
end $$;
reset role;
do $$ begin
  if not exists(select 1 from auth.users where id=(select member from admin_fixture)) then
    raise exception 'FAIL: user deleted.';
  end if;
end $$;
select set_config('request.jwt.claims',json_build_object('role','authenticated','sub',(select owner from admin_fixture))::text,true);
set local role authenticated;
do $$ declare rejected boolean:=false; begin
  begin perform public.manage_admin_membership((select owner from admin_fixture),(select customer from admin_fixture),true);
  exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'FAIL: browser bypassed backend reauthentication.'; end if;
  rejected:=false;
  begin update public.catalogue_admins set is_owner=true where user_id=(select owner from admin_fixture);
  exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'FAIL: client can write owner flag.'; end if;
end $$;
reset role;
rollback;
