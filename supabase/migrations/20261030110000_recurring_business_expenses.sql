create table public.recurring_business_expenses (
  id uuid primary key,
  description text not null check(length(btrim(description)) between 1 and 150),
  category text not null check(category in ('Advertising','Tools & equipment','Subscriptions','Rent & utilities','Travel','Other')),
  amount numeric(12,2) not null check(amount>0 and amount<10000000000),
  notes text not null default '' check(length(notes)<=1000),
  starts_on date not null check(starts_on between '2000-01-01'::date and '2100-12-31'::date),
  ends_on date check(ends_on>=starts_on and ends_on<='2100-12-31'::date),
  frequency_unit text not null check(frequency_unit in ('days','weeks','months','years')),
  frequency_interval integer not null check(frequency_interval between 1 and 120),
  active boolean not null default true,
  next_index integer not null default 0 check(next_index>=0),
  version integer not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.recurring_business_expenses enable row level security;
revoke all on public.recurring_business_expenses from public,anon,authenticated;
grant select on public.recurring_business_expenses to authenticated;
grant all on public.recurring_business_expenses to service_role;
create policy recurring_expenses_admin_read on public.recurring_business_expenses
  for select to authenticated using(public.is_catalogue_admin());

alter table public.business_expenses
  add column recurring_expense_id uuid references public.recurring_business_expenses(id) on delete restrict,
  add column recurring_date date,
  add constraint business_expenses_recurrence_pair check((recurring_expense_id is null)=(recurring_date is null)),
  add constraint business_expenses_recurrence_unique unique(recurring_expense_id,recurring_date);
revoke insert,update on public.business_expenses from public,anon,authenticated;
grant insert(description,expense_date,category,amount,notes,updated_at),
  update(description,expense_date,category,amount,notes,updated_at) on public.business_expenses to authenticated;

create function public.recurring_expense_date(anchor date,unit text,every_count integer,occurrence integer)
returns date language plpgsql immutable set search_path=''
as $$
begin
  if anchor is null or unit is null or unit not in ('days','weeks','months','years')
    or every_count is null or every_count not between 1 and 120 or occurrence is null or occurrence<0 or occurrence>100000 then
    raise exception 'Invalid recurring expense date inputs.';
  end if;
  return case unit
    when 'days' then anchor+every_count*occurrence
    when 'weeks' then anchor+7*every_count*occurrence
    when 'months' then (anchor+make_interval(months=>every_count*occurrence))::date
    when 'years' then (anchor+make_interval(years=>every_count*occurrence))::date end;
end $$;
revoke all on function public.recurring_expense_date(date,text,integer,integer) from public,anon;
grant execute on function public.recurring_expense_date(date,text,integer,integer) to authenticated,service_role;
alter table public.recurring_business_expenses add column next_due date generated always as
  (public.recurring_expense_date(starts_on,frequency_unit,frequency_interval,next_index)) stored;

create function public.generate_recurring_business_expenses()
returns integer language plpgsql security definer set search_path=''
as $$
declare schedule public.recurring_business_expenses; due date; cursor_index integer; processed integer;
  today date:=(now() at time zone 'Asia/Kolkata')::date; generated integer:=0;
begin
  if not pg_try_advisory_xact_lock(817268) then return 0; end if;
  for schedule in select * from public.recurring_business_expenses where active order by starts_on,id for update loop
    cursor_index:=schedule.next_index;
    processed:=0;
    due:=public.recurring_expense_date(schedule.starts_on,schedule.frequency_unit,schedule.frequency_interval,cursor_index);
    while due<=today and (schedule.ends_on is null or due<=schedule.ends_on) and processed<100 loop
      insert into public.business_expenses(description,expense_date,category,amount,notes,recurring_expense_id,recurring_date)
        values(schedule.description,due,schedule.category,schedule.amount,schedule.notes,schedule.id,due)
        on conflict(recurring_expense_id,recurring_date) do nothing;
      generated:=generated+1;
      processed:=processed+1;
      cursor_index:=cursor_index+1;
      due:=public.recurring_expense_date(schedule.starts_on,schedule.frequency_unit,schedule.frequency_interval,cursor_index);
    end loop;
    update public.recurring_business_expenses set next_index=cursor_index,
      active=case when schedule.ends_on is not null and due>schedule.ends_on then false else active end
      where id=schedule.id;
  end loop;
  return generated;
end $$;
revoke all on function public.generate_recurring_business_expenses() from public,anon,authenticated;
grant execute on function public.generate_recurring_business_expenses() to service_role;

create function public.create_recurring_business_expense(request_id uuid,expense_description text,expense_category text,
  expense_amount numeric,expense_notes text,start_date date,end_date date,repeat_unit text,repeat_interval integer)
returns uuid language plpgsql security definer set search_path=''
as $$
declare previous public.recurring_business_expenses; today date:=(now() at time zone 'Asia/Kolkata')::date;
begin
  if not public.is_catalogue_admin() then raise exception 'Verified admin access required.'; end if;
  if request_id is null or expense_description is null or length(btrim(expense_description)) not between 1 and 150
    or expense_category is null or expense_category not in ('Advertising','Tools & equipment','Subscriptions','Rent & utilities','Travel','Other')
    or expense_amount is null or not(expense_amount>0 and expense_amount<10000000000) or expense_amount<>round(expense_amount,2)
    or expense_notes is null or length(expense_notes)>1000
    or start_date is null or start_date<'2000-01-01'::date or start_date>'2100-12-31'::date
    or (end_date is not null and (end_date<start_date or end_date>'2100-12-31'::date))
    or repeat_unit is null or repeat_unit not in ('days','weeks','months','years')
    or repeat_interval is null or repeat_interval not between 1 and 120 then raise exception 'Check recurring expense details, dates and frequency (1-120).'; end if;
  perform pg_advisory_xact_lock(817268);
  select * into previous from public.recurring_business_expenses where id=request_id;
  if found then
    if previous.created_by=auth.uid() and previous.description=btrim(expense_description) and previous.category=expense_category
      and previous.amount=expense_amount and previous.notes=btrim(expense_notes) and previous.starts_on=start_date
      and previous.ends_on is not distinct from end_date and previous.frequency_unit=repeat_unit and previous.frequency_interval=repeat_interval then return request_id; end if;
    raise exception 'Recurring expense request changed. Refresh before retrying.';
  end if;
  if start_date<today then raise exception 'Start on today or a future date. Add earlier expenses individually.'; end if;
  if (select count(*) from public.recurring_business_expenses where active)>=500 then raise exception 'At most 500 active recurring expenses are allowed. Pause an unused schedule first.'; end if;
  insert into public.recurring_business_expenses(id,description,category,amount,notes,starts_on,ends_on,frequency_unit,frequency_interval,created_by)
    values(request_id,btrim(expense_description),expense_category,expense_amount,btrim(expense_notes),start_date,end_date,repeat_unit,repeat_interval,auth.uid());
  perform public.generate_recurring_business_expenses();
  return request_id;
end $$;
revoke all on function public.create_recurring_business_expense(uuid,text,text,numeric,text,date,date,text,integer) from public,anon;
grant execute on function public.create_recurring_business_expense(uuid,text,text,numeric,text,date,date,text,integer) to authenticated;

create function public.set_recurring_business_expense_active(schedule_id uuid,expected_version integer,enabled boolean)
returns uuid language plpgsql security definer set search_path=''
as $$
declare schedule public.recurring_business_expenses; due date; cursor_index integer;
  today date:=(now() at time zone 'Asia/Kolkata')::date;
begin
  if not public.is_catalogue_admin() then raise exception 'Verified admin access required.'; end if;
  if enabled is null then raise exception 'Choose whether the schedule is active.'; end if;
  perform pg_advisory_xact_lock(817268);
  select * into schedule from public.recurring_business_expenses where id=schedule_id for update;
  if not found or schedule.version is distinct from expected_version then raise exception 'Schedule changed. Refresh before updating.'; end if;
  if enabled and not schedule.active and (select count(*) from public.recurring_business_expenses where active)>=500 then
    raise exception 'At most 500 active recurring expenses are allowed.';
  end if;
  cursor_index:=schedule.next_index;
  if enabled then
    due:=public.recurring_expense_date(schedule.starts_on,schedule.frequency_unit,schedule.frequency_interval,cursor_index);
    while due<today loop
      cursor_index:=cursor_index+1;
      due:=public.recurring_expense_date(schedule.starts_on,schedule.frequency_unit,schedule.frequency_interval,cursor_index);
    end loop;
    if schedule.ends_on is not null and due>schedule.ends_on then raise exception 'Schedule has ended. Create a new schedule.'; end if;
  end if;
  update public.recurring_business_expenses set active=enabled,next_index=cursor_index,version=version+1,updated_at=now() where id=schedule_id;
  if enabled then perform public.generate_recurring_business_expenses(); end if;
  return schedule_id;
end $$;
revoke all on function public.set_recurring_business_expense_active(uuid,integer,boolean) from public,anon;
grant execute on function public.set_recurring_business_expense_active(uuid,integer,boolean) to authenticated;

select cron.schedule('generate-recurring-business-expenses','7 * * * *',
  'select public.generate_recurring_business_expenses();');
