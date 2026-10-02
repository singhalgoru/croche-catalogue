-- Rebuild the static site (product share pages and sitemap) whenever the
-- catalogue changes. The GitHub token lives in Supabase Vault under the name
-- `github_deploy_token`; without it these triggers do nothing.
--
-- Each data-changing statement queues a `workflow_dispatch` asking the deploy
-- workflow to wait before building. Newer runs cancel older ones
-- (`cancel-in-progress`), so a burst of admin edits results in one build of
-- the final data. pg_net sends the request after the transaction commits,
-- outside the admin's save.

create extension if not exists pg_net with schema extensions;

create or replace function public.request_site_rebuild()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  deploy_token text;
begin
  select decrypted_secret
  into deploy_token
  from vault.decrypted_secrets
  where name = 'github_deploy_token'
  limit 1;

  if coalesce(deploy_token, '') = '' then
    return null;
  end if;

  perform net.http_post(
    url := 'https://api.github.com/repos/singhalgoru/croche-catalogue/actions/workflows/deploy.yml/dispatches',
    body := jsonb_build_object(
      'ref', 'main',
      'inputs', jsonb_build_object('delay_seconds', '60')
    ),
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || deploy_token,
      'Accept', 'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      'User-Agent', 'luvia-catalogue-supabase',
      'Content-Type', 'application/json'
    )
  );

  return null;
exception
  -- A rebuild request must never block a catalogue save.
  when others then
    raise warning 'Site rebuild request failed: %', sqlerrm;
    return null;
end;
$$;

revoke all on function public.request_site_rebuild() from public, anon, authenticated;

drop trigger if exists request_site_rebuild on public.products;
create trigger request_site_rebuild
after insert or update or delete on public.products
for each statement execute function public.request_site_rebuild();

drop trigger if exists request_site_rebuild on public.product_variants;
create trigger request_site_rebuild
after insert or update or delete on public.product_variants
for each statement execute function public.request_site_rebuild();

drop trigger if exists request_site_rebuild on public.product_variant_images;
create trigger request_site_rebuild
after insert or update or delete on public.product_variant_images
for each statement execute function public.request_site_rebuild();

drop trigger if exists request_site_rebuild on public.categories;
create trigger request_site_rebuild
after insert or update or delete on public.categories
for each statement execute function public.request_site_rebuild();
