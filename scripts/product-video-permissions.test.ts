// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
const migration = readFileSync(new URL('../supabase/migrations/20261018130000_product_making_videos.sql', import.meta.url), 'utf8');
const edge = readFileSync(new URL('../supabase/functions/product-videos/index.ts', import.meta.url), 'utf8');
const dispatch = readFileSync(new URL('../supabase/migrations/20261018142000_dispatch_product_video_processing.sql', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../.github/workflows/process-product-videos.yml', import.meta.url), 'utf8');
it('dispatches only actual user-created work with no recurring idle workflow budget', () => {
  expect(workflow).not.toContain('schedule:');
  expect(workflow).not.toContain('cron:');
  expect(workflow).toContain('timeout-minutes: 14');
  expect(workflow).toContain('has_work');
  expect(workflow).toContain('test -f public/images/luvia-logo-480.webp');
  expect(dispatch).toContain("name='github_deploy_token'");
  expect(dispatch).toContain("from public,anon,authenticated");
  expect(dispatch).toContain("new.status='queued'");
  expect(dispatch).toContain("new.status='discarding'");
});
it('protects direct metadata writes, private jobs and all worker-only RPCs', () => {
  expect(migration).toContain('revoke all on public.product_making_videos, public.product_video_jobs from anon,authenticated');
  expect(migration).toContain('alter table public.product_video_jobs enable row level security');
  expect(migration).toContain('alter table public.product_making_videos enable row level security');
  const workerPrivileges = migration.split('revoke all on function public.claim_product_video()')[1];
  expect(workerPrivileges).toContain('from public,anon,authenticated');
  expect(workerPrivileges).toContain('public.finish_product_video_publish');
  expect(workerPrivileges).toContain('public.finish_product_video_discard');
  const publicPolicy = migration.split('create policy "Published making videos"')[1].split(';')[0];
  expect(publicPolicy).toContain('p.published');
  expect(publicPolicy).not.toContain('is_catalogue_admin');
  for (const fn of ['reserve_product_video', 'begin_product_video_upload', 'remove_product_video', 'discard_product_video', 'begin_product_video_publish']) {
    expect(migration.split(`create function public.${fn}`)[1].split('end $$;')[0]).toContain('if not public.is_catalogue_admin()');
  }
});
it('stages processing privately and makes publication a separate, leased admin action', () => {
  const processing = migration.split('create function public.finish_product_video(')[1].split('end $$;')[0];
  expect(processing).toContain("status='review'");
  expect(processing).not.toContain('product_making_videos');
  const discard = migration.split('create function public.discard_product_video(')[1].split('end $$;')[0];
  expect(discard).toContain("status='discarding'");
  expect(discard).not.toContain('delete from product_making_videos');
  expect(migration).toContain('if j.writer_active then return false');
  expect(migration).toContain('lease=p_lease');
  expect(migration).toContain('for update skip locked limit 1');
});
it('authenticates binary uploads and private preview URLs, and never signs reusable upload URLs', () => {
  expect(edge).toContain('db.auth.getUser()');
  expect(edge).toContain("db.rpc('is_catalogue_admin')");
  expect(edge).toContain('bucket === publicBucket');
  expect(edge).toContain("url.searchParams.set('X-Amz-Expires', '300')");
  expect(edge).toContain("job.status !== 'review'");
  expect(edge).toContain("method: 'GET', aws: { signQuery: true }");
  expect(edge).not.toContain("method: 'PUT', aws: { signQuery: true }");
  expect(edge).not.toContain('body.filename');
});
