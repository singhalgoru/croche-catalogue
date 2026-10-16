begin;

create temporary table cron_history_fixture as
select cron.schedule(
  'cron-history-retention-test-' || gen_random_uuid()::text,
  '0 0 1 1 *',
  'select 1;'
) as jobid;

select cron.alter_job(jobid, active := false) from cron_history_fixture;

insert into cron.job_run_details(runid, jobid, database, username, command, status, start_time, end_time)
select -(fixture.jobid * 100 + run_number), fixture.jobid, current_database(), current_user, 'select 1;',
  case when run_number % 2 = 0 then 'failed' else 'succeeded' end,
  now() - make_interval(mins => run_number) - interval '1 second',
  now() - make_interval(mins => run_number)
from cron_history_fixture fixture
cross join generate_series(1, 10) run_number;

insert into cron.job_run_details(runid, jobid, database, username, command, status, start_time)
select -(jobid * 100 + 11), jobid, current_database(), current_user, 'select 1;', 'running', now()
from cron_history_fixture;

select public.prune_cron_run_history();

do $$
declare
  fixture_jobid bigint := (select jobid from cron_history_fixture);
begin
  if (select count(*) from cron.job
      where jobname = 'retain-last-seven-cron-runs'
        and schedule = '17 0 * * *' and active) <> 1 then
    raise exception 'Expected one active daily history cleanup job.';
  end if;
  if (select count(*) from cron.job_run_details where jobid = fixture_jobid and end_time is not null) <> 7 then
    raise exception 'Expected exactly seven completed runs.';
  end if;
  if exists (
    select 1 from cron.job_run_details
    where jobid = fixture_jobid and end_time < now() - interval '7 minutes'
  ) then
    raise exception 'Older completed runs were retained instead of the latest seven.';
  end if;
  if (select count(*) from cron.job_run_details where jobid = fixture_jobid and status = 'running' and end_time is null) <> 1 then
    raise exception 'Running job history must remain untouched.';
  end if;
  if not exists (select 1 from cron.job where jobid = fixture_jobid) then
    raise exception 'Retention must not delete scheduled jobs.';
  end if;
  if has_function_privilege('authenticated', 'public.prune_cron_run_history()', 'execute')
    or has_function_privilege('anon', 'public.prune_cron_run_history()', 'execute') then
    raise exception 'Public API roles must not execute history cleanup.';
  end if;
end;
$$;

rollback;
