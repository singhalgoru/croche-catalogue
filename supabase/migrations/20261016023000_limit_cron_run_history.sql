do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise exception 'pg_cron must be enabled before configuring job history retention.';
  end if;
end;
$$;

create function public.prune_cron_run_history()
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  deleted_count bigint;
begin
  with ranked_runs as (
    select runid,
      row_number() over (
        partition by jobid
        order by end_time desc, runid desc
      ) as run_position
    from cron.job_run_details
    where end_time is not null
  )
  delete from cron.job_run_details details
  using ranked_runs ranked
  where details.runid = ranked.runid
    and ranked.run_position > 7;

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.prune_cron_run_history() from public, anon, authenticated, service_role;

select public.prune_cron_run_history();

select cron.schedule(
  'retain-last-seven-cron-runs',
  '17 * * * *',
  'select public.prune_cron_run_history();'
);
