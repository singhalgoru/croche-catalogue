-- No recurring idle GitHub Actions schedule. Reuse the existing deploy token,
-- pg_net and Vault setup, dispatching only when an admin actually creates work.
create function public.request_product_video_processing()
returns void language plpgsql security definer set search_path='' as $$
declare token text;
begin
  select decrypted_secret into token from vault.decrypted_secrets
    where name='github_deploy_token' limit 1;
  if coalesce(token,'')='' then
    raise exception 'Video processor dispatch token is not configured.';
  end if;
  perform net.http_post(
    url:='https://api.github.com/repos/singhalgoru/croche-catalogue/actions/workflows/process-product-videos.yml/dispatches',
    body:=jsonb_build_object('ref','main'),
    headers:=jsonb_build_object('Authorization','Bearer '||token,'Accept','application/vnd.github+json',
      'X-GitHub-Api-Version','2022-11-28','User-Agent','luvia-catalogue-supabase','Content-Type','application/json')
  );
end $$;
revoke all on function public.request_product_video_processing() from public,anon,authenticated;
grant execute on function public.request_product_video_processing() to service_role;

create function public.dispatch_product_video_job()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform public.request_product_video_processing();
  return null;
end $$;
revoke all on function public.dispatch_product_video_job() from public,anon,authenticated;
create trigger dispatch_product_video_job after update of status on public.product_video_jobs
for each row when (new.status='discarding' or (new.status='queued' and old.status is distinct from new.status))
execute function public.dispatch_product_video_job();
