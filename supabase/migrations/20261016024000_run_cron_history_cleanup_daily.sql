select cron.schedule(
  'retain-last-seven-cron-runs',
  '17 0 * * *',
  'select public.prune_cron_run_history();'
);
