begin;
create temporary table recurring_fixture as select gen_random_uuid() admin_id,gen_random_uuid() session_id,gen_random_uuid() factor_id,
  gen_random_uuid() schedule_id,(now() at time zone 'Asia/Kolkata')::date today;
grant select on recurring_fixture to authenticated,anon;
insert into auth.users(id) select admin_id from recurring_fixture;
insert into public.catalogue_admins(user_id) select admin_id from recurring_fixture;
insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at,secret)
select factor_id,admin_id,'totp','verified',now(),now(),'fixture' from recurring_fixture;
insert into auth.sessions(id,user_id,factor_id,aal,created_at,updated_at)
select session_id,admin_id,factor_id,'aal2',now(),now() from recurring_fixture;
do $$ begin
  if public.recurring_expense_date('2027-01-31','months',1,1)<>'2027-02-28'::date
    or public.recurring_expense_date('2027-01-31','months',1,2)<>'2027-03-31'::date
    or public.recurring_expense_date('2028-01-31','months',1,1)<>'2028-02-29'::date
    or public.recurring_expense_date('2028-02-29','years',1,1)<>'2029-02-28'::date
    or public.recurring_expense_date('2028-02-29','years',1,4)<>'2032-02-29'::date
    or public.recurring_expense_date('2027-01-01','weeks',2,2)<>'2027-01-29'::date
    or public.recurring_expense_date('2027-01-31','months',3,2)<>'2027-07-31'::date
    then raise exception 'FAIL: date anchor/clamping/frequency incorrect.'; end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal2','session_id',session_id,
  'amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from now())))))::text,true) from recurring_fixture;
set local role authenticated;
do $$ declare f record; bad numeric; manual_id uuid; begin
  select * into f from recurring_fixture;
  insert into public.business_expenses(description,expense_date,category,amount,notes,updated_at)
    values('Synthetic manual overhead',f.today,'Other',12.50,'manual',now()) returning id into manual_id;
  update public.business_expenses set amount=15,notes='corrected',updated_at=now() where id=manual_id;
  if not exists(select 1 from public.business_expenses where id=manual_id and amount=15 and recurring_expense_id is null) then
    raise exception 'FAIL: manual expense create/update regressed.'; end if;
  delete from public.business_expenses where id=manual_id;
  foreach bad in array array[0,-1,1.001,10000000000,'NaN'::numeric,'Infinity'::numeric] loop
    begin
      perform public.create_recurring_business_expense(f.schedule_id,'Synthetic subscription','Subscriptions',bad,'',f.today,null,'months',1);
      raise exception 'FAIL: invalid amount accepted.';
    exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  end loop;
  begin
    perform public.create_recurring_business_expense(f.schedule_id,'Synthetic subscription','Subscriptions',100,'',f.today-1,null,'months',1);
    raise exception 'FAIL: past start accepted.';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    perform public.create_recurring_business_expense(f.schedule_id,'Synthetic subscription','Subscriptions',100,'',f.today,null,'months',0);
    raise exception 'FAIL: zero frequency accepted.';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  perform public.create_recurring_business_expense(f.schedule_id,'Synthetic subscription','Subscriptions',100.25,'fixture',f.today,null,'months',1);
  perform public.create_recurring_business_expense(f.schedule_id,'Synthetic subscription','Subscriptions',100.25,'fixture',f.today,null,'months',1);
  if (select count(*) from public.business_expenses where recurring_expense_id=f.schedule_id)<>1 then raise exception 'FAIL: first occurrence missing/duplicated.'; end if;
  begin
    perform public.create_recurring_business_expense(f.schedule_id,'changed','Subscriptions',100.25,'fixture',f.today,null,'months',1);
    raise exception 'FAIL: changed request replay accepted.';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    update public.business_expenses set recurring_date=f.today-1 where recurring_expense_id=f.schedule_id;
    raise exception 'FAIL: client changed generation metadata.';
  exception when insufficient_privilege then null; end;
  update public.business_expenses set notes='Single occurrence correction' where recurring_expense_id=f.schedule_id;
  perform public.set_recurring_business_expense_active(f.schedule_id,1,false);
  begin
    perform public.set_recurring_business_expense_active(f.schedule_id,1,true); raise exception 'FAIL: stale toggle accepted.';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  perform public.set_recurring_business_expense_active(f.schedule_id,2,true);
  begin perform public.generate_recurring_business_expenses(); raise exception 'FAIL: client invoked privileged worker.';
    exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ declare f record; catchup uuid:=gen_random_uuid(); paused uuid:=gen_random_uuid(); future uuid:=gen_random_uuid(); begin
  select * into f from recurring_fixture;
  perform public.generate_recurring_business_expenses();
  if (select count(*) from public.business_expenses where recurring_expense_id=f.schedule_id)<>1 then raise exception 'FAIL: retry duplicated occurrence.'; end if;
  delete from public.business_expenses where recurring_expense_id=f.schedule_id;
  perform public.generate_recurring_business_expenses();
  if exists(select 1 from public.business_expenses where recurring_expense_id=f.schedule_id) then raise exception 'FAIL: deleted occurrence regenerated.'; end if;
  insert into public.recurring_business_expenses(id,description,category,amount,starts_on,ends_on,frequency_unit,frequency_interval)
    values(catchup,'Synthetic catchup','Rent & utilities',150,f.today-4,f.today-1,'days',1),
      (future,'Synthetic future','Subscriptions',100,f.today+1,null,'weeks',2);
  insert into public.recurring_business_expenses(id,description,category,amount,starts_on,frequency_unit,frequency_interval,active)
    values(paused,'Synthetic paused','Other',50,f.today-4,'days',1,false);
  perform public.generate_recurring_business_expenses();
  perform public.generate_recurring_business_expenses();
  if (select count(*) from public.business_expenses where recurring_expense_id=catchup)<>4
    or (select sum(amount) from public.business_expenses where recurring_expense_id=catchup)<>600
    or exists(select 1 from public.business_expenses where recurring_expense_id in (paused,future))
    or exists(select 1 from public.recurring_business_expenses where id=catchup and active)
    then raise exception 'FAIL: catchup/end/paused/future semantics.'; end if;
  perform public.set_recurring_business_expense_active(paused,1,true);
  if (select count(*) from public.business_expenses where recurring_expense_id=paused)<>1
    or not exists(select 1 from public.business_expenses where recurring_expense_id=paused and expense_date=f.today)
    then raise exception 'FAIL: resume backfilled paused dates or lost today.'; end if;
  begin
    perform public.set_recurring_business_expense_active(catchup,1,true); raise exception 'FAIL: ended schedule resumed.';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal1','session_id',session_id)::text,true) from recurring_fixture;
set local role authenticated;
do $$ begin
  if exists(select 1 from public.recurring_business_expenses) then raise exception 'FAIL: non-MFA admin read schedules.'; end if;
  begin
    perform public.set_recurring_business_expense_active((select schedule_id from recurring_fixture),3,false);
    raise exception 'FAIL: non-MFA admin changed schedule.';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
end $$;
reset role;
set local role anon;
do $$ begin
  begin perform 1 from public.recurring_business_expenses; raise exception 'FAIL: public schedules access.'; exception when insufficient_privilege then null; end;
  begin perform public.generate_recurring_business_expenses(); raise exception 'FAIL: public worker access.'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
