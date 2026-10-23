// @vitest-environment node
import { access, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { processQueue } from './process-product-videos.mjs';

const { rpc, from, storageFetch } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), storageFetch: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ rpc, from }) }));
vi.mock('aws4fetch', () => ({ AwsClient: class { fetch = storageFetch; } }));
const id = '11111111-1111-4111-8111-111111111111';
const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fixture',
  R2_ACCOUNT_ID: 'account', R2_ACCESS_KEY_ID: 'fixture', R2_SECRET_ACCESS_KEY: 'fixture',
  R2_BUCKET: 'public', R2_ORIGINALS_BUCKET: 'private', R2_PUBLIC_URL: 'https://images.example.test' };
let jobs: { id: string; lease: string; source_bytes: number; music_bytes?: number; music_type?: string;
  music_mode?: string; music_source?: string }[];
let publish = true;
let discarded: { id: string; writer_active: boolean; original_upload_id?: string }[] = [];
let processed: { id: string }[] = [];
let replaced: { id: string; writer_active: boolean; public_asset_name?: string }[] = [];
let live: { job_id: string }[] = [];
const encode = vi.fn(async (_input: string, output: string, poster: string, _run?: unknown, _music?: unknown) => {
  await writeFile(output, 'encoded');
  await writeFile(poster, 'poster');
  return { duration: 20, width: 1280, height: 720 };
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  publish = true;
  discarded = [];
  processed = [];
  replaced = []; live = [];
  jobs = [{ id, lease: id, source_bytes: 3 }];
  rpc.mockImplementation(async (name: string, args: { p_error?: string }) => ({
    data: name === 'claim_product_video' ? jobs.splice(0, 1)
      : name === 'finish_product_video_discard' ? !args?.p_error : args?.p_error ? false : publish, error: null,
  }));
  let filter = '';
  const query = { select: () => query, eq: (column: string, value: string) => { filter = column === 'job_id' ? 'live' : value; return query; },
    in: (_column: string, statuses: string[]) => {
      expect(statuses).toEqual(['ready']);
      filter = 'processed'; return query;
    }, is: () => query,
    limit: async () => ({ data: filter === 'processed' ? processed : filter === 'discarding' ? discarded
      : filter === 'replaced' ? replaced : filter === 'live' ? live : jobs.filter(() => true), error: null }) };
  from.mockReturnValue(query);
  storageFetch.mockImplementation(async (_url: string, options?: { method?: string }) =>
    new Response(options?.method ? null : 'mp4', { status: 200 }));
});
afterEach(() => vi.restoreAllMocks());

it('stages only private assets after both uploads succeed and never publishes automatically', async () => {
  await processQueue(env, { encode });
  const finish = rpc.mock.calls.find(call => call[0] === 'finish_product_video')![1];
  expect(finish).toMatchObject({ p_job_id: id, p_lease: id, p_duration: 20, p_video_bytes: 7 });
  expect(finish.p_video_url).toBeUndefined();
  expect(rpc.mock.calls.some(call => call[0] === 'finish_product_video_publish')).toBe(false);
  const puts = storageFetch.mock.calls.filter(call => call[1]?.method === 'PUT');
  expect(puts.map(call => call[0])).toEqual([
    `https://account.r2.cloudflarestorage.com/private/making-videos/${id}/video.mp4`,
    `https://account.r2.cloudflarestorage.com/private/making-videos/${id}/poster.webp`,
  ]);
  expect(storageFetch.mock.invocationCallOrder[2]).toBeLessThan(rpc.mock.invocationCallOrder[1]);
  await expect(access(resolve('.video-processing', id))).rejects.toThrow();
});

it('records an explicit failure without publishing when either asset upload fails', async () => {
  storageFetch.mockImplementation(async (url: string, options?: { method?: string }) =>
    new Response(options?.method ? null : 'mp4', { status: url.endsWith('poster.webp') ? 503 : 200 }));
  await expect(processQueue(env, { encode })).rejects.toThrow('One or more video jobs failed');
  const finish = rpc.mock.calls.find(call => call[0] === 'finish_product_video')![1];
  expect(finish.p_error).toContain('HTTP 503');
  expect(finish.p_video_bytes).toBeNull();
  expect(storageFetch.mock.calls.filter(call => call[1]?.method === 'DELETE')).toHaveLength(0);
  await expect(access(resolve('.video-processing', id))).rejects.toThrow();
});

it('deletes only published originals, verifies absence, then records cleanup without deleting processed assets', async () => {
  jobs = [];
  processed = [{ id }];
  storageFetch.mockImplementation(async (_url: string, options?: { method?: string }) =>
    new Response(null, { status: options?.method === 'HEAD' ? 404 : 204 }));
  await processQueue(env, { encode });
  expect(storageFetch.mock.calls.map(call => [call[0], call[1].method])).toEqual([
    [`https://account.r2.cloudflarestorage.com/private/making-videos/${id}/original.mp4`, 'DELETE'],
    [`https://account.r2.cloudflarestorage.com/private/making-videos/${id}/original.mp4`, 'HEAD'],
  ]);
  expect(rpc).toHaveBeenCalledWith('finish_product_video_original_cleanup', { p_job_id: id });
});

it('keeps the original after processing into a private review draft', async () => {
  await processQueue(env, { encode });
  expect(rpc).toHaveBeenCalledWith('finish_product_video', expect.objectContaining({ p_duration: 20 }));
  expect(storageFetch.mock.calls.filter(call => call[1]?.method === 'DELETE')).toHaveLength(0);
  expect(rpc.mock.calls.some(call => call[0] === 'finish_product_video_original_cleanup')).toBe(false);
});

it.each([undefined, 'rose-charm'])('deletes and verifies replaced assets in private and both public buckets (%s)', async publicName => {
  jobs = []; replaced = [{ id, writer_active: false, public_asset_name: publicName }];
  storageFetch.mockImplementation(async (_url: string, options?: { method?: string }) =>
    new Response(null, { status: options?.method === 'HEAD' ? 404 : 204 }));
  await processQueue({ ...env, R2_VIDEO_BUCKET: 'videos' }, { encode });
  const deletes = storageFetch.mock.calls.filter(call => call[1]?.method === 'DELETE').map(call => call[0]);
  expect(deletes).toContain(`https://account.r2.cloudflarestorage.com/private/making-videos/${id}/music.bin`);
  for (const bucket of ['public', 'videos']) {
    expect(deletes).toContain(`https://account.r2.cloudflarestorage.com/${bucket}/making-videos/${id}/${publicName || 'video'}.mp4`);
    expect(deletes).toContain(`https://account.r2.cloudflarestorage.com/${bucket}/making-videos/${id}/${publicName ? `${publicName}-poster` : 'poster'}.webp`);
  }
  expect(storageFetch.mock.calls.filter(call => call[1]?.method === 'HEAD')).toHaveLength(deletes.length);
  expect(rpc).toHaveBeenCalledWith('finish_replaced_product_video_cleanup', { p_job_id: id });
});

it('never deletes a video still referenced by published metadata', async () => {
  jobs = []; replaced = [{ id, writer_active: false }]; live = [{ job_id: id }];
  await expect(processQueue(env, { encode })).rejects.toThrow('Refusing to delete published video');
  expect(storageFetch).not.toHaveBeenCalled();
});

it.each([['DELETE', 503], ['HEAD', 200], ['HEAD', 403]])('leaves replaced cleanup retryable after %s HTTP %i', async (method, status) => {
  jobs = []; replaced = [{ id, writer_active: false }];
  storageFetch.mockImplementation(async (_url: string, options?: { method?: string }) =>
    new Response(null, { status: options?.method === method ? status : 204 }));
  await expect(processQueue(env, { encode })).rejects.toThrow(/cleanup failed|could not be verified/);
  expect(rpc).not.toHaveBeenCalledWith('finish_replaced_product_video_cleanup', { p_job_id: id });
});

it.each([['DELETE', 503], ['HEAD', 200], ['HEAD', 403]])(
  'does not record original cleanup if %s returns %i', async (method, status) => {
    jobs = []; processed = [{ id }];
    storageFetch.mockImplementation(async (_url: string, options?: { method?: string }) =>
      new Response(null, { status: options?.method === method ? status : 204 }));
    await expect(processQueue(env, { encode })).rejects.toThrow(/Original video/);
    expect(rpc).not.toHaveBeenCalledWith('finish_product_video_original_cleanup', { p_job_id: id });
    expect(rpc.mock.calls.some(call => call[0] === 'finish_product_video')).toBe(false);
  },
);

it('honors explicit discard tombstones after an in-flight writer finishes and deletes all draft assets', async () => {
  publish = false;
  discarded = [{ id, writer_active: false }];
  await processQueue(env, { encode });
  expect(storageFetch.mock.calls.filter(call => call[1]?.method === 'DELETE').map(call => call[0])).toEqual([
    `https://account.r2.cloudflarestorage.com/private/making-videos/${id}/original.mp4`,
    `https://account.r2.cloudflarestorage.com/private/making-videos/${id}/music.bin`,
    `https://account.r2.cloudflarestorage.com/private/making-videos/${id}/video.mp4`,
    `https://account.r2.cloudflarestorage.com/private/making-videos/${id}/poster.webp`,
    `https://account.r2.cloudflarestorage.com/public/making-videos/${id}/video.mp4`,
    `https://account.r2.cloudflarestorage.com/public/making-videos/${id}/poster.webp`,
  ]);
  expect(rpc).toHaveBeenCalledWith('finish_product_video_discard', { p_job_id: id });
});

it('keeps a discard pending while another writer is active and never applies an automatic retention policy', async () => {
  jobs = [];
  discarded = [{ id, writer_active: true }];
  await processQueue(env, { encode });
  expect(storageFetch).not.toHaveBeenCalled();
  expect(rpc.mock.calls.some(call => call[0] === 'finish_product_video_discard')).toBe(false);
});

it('records cleanup failure and leaves its tombstone retryable instead of claiming successful discard', async () => {
  jobs = [];
  discarded = [{ id, writer_active: false }];
  storageFetch.mockResolvedValue(new Response(null, { status: 503 }));
  await expect(processQueue(env, { encode })).rejects.toThrow('Draft cleanup failed');
  expect(rpc).toHaveBeenCalledWith('finish_product_video_discard', {
    p_job_id: id, p_error: expect.stringContaining('HTTP 503'),
  });
  expect(rpc).not.toHaveBeenCalledWith('finish_product_video_discard', { p_job_id: id });
});

it('bounds each invocation to three sequential claims', async () => {
  jobs = Array.from({ length: 4 }, (_, index) => ({
    id: `${index + 1}1111111-1111-4111-8111-111111111111`, lease: id, source_bytes: 3,
  }));
  await processQueue(env, { encode });
  expect(rpc.mock.calls.filter(call => call[0] === 'claim_product_video')).toHaveLength(3);
  expect(encode).toHaveBeenCalledTimes(3);
  expect(jobs).toHaveLength(1);
  expect(rpc).toHaveBeenCalledWith('request_product_video_processing', undefined);
});

it('rejects changed original size before invoking FFmpeg', async () => {
  jobs[0].source_bytes = 4;
  await expect(processQueue(env, { encode })).rejects.toThrow('One or more video jobs failed');
  expect(encode).not.toHaveBeenCalled();
  expect(rpc.mock.calls.find(call => call[0] === 'finish_product_video')![1].p_error).toContain('size changed');
});
it('downloads retained private music and passes trusted job metadata to the encoder', async () => {
  // Legacy 'mix' rows are encoded exactly like 'replace': no source-audio mode is forwarded.
  Object.assign(jobs[0], { music_bytes: 3, music_type: 'audio/mpeg', music_mode: 'mix' });
  await processQueue(env, { encode });
  expect(encode.mock.calls[0][4]).toEqual({
    path: resolve('.video-processing', id, 'music.bin'), type: 'audio/mpeg',
  });
  expect(storageFetch.mock.calls.some(call => call[0].endsWith('/music.bin'))).toBe(true);
  expect(storageFetch.mock.calls.filter(call => call[1]?.method === 'DELETE')).toHaveLength(0);
});
it('uses the fixed private default track for brand jobs and never deletes it', async () => {
  let brandBytes: Buffer | undefined;
  encode.mockImplementationOnce(async (_input: string, output: string, poster: string, _run?: unknown, music?: unknown) => {
    brandBytes = await readFile((music as { path: string }).path);
    await writeFile(output, 'encoded'); await writeFile(poster, 'poster');
    return { duration: 20, width: 404, height: 720 };
  });
  Object.assign(jobs[0], { music_source: 'brand' });
  await processQueue(env, { encode });
  expect(encode.mock.calls[0][4]).toEqual({ path: resolve('.video-processing', id, 'music.wav'), type: 'audio/wav' });
  expect(brandBytes?.toString()).toBe('mp4');
  expect(storageFetch.mock.calls.some(call =>
    call[0] === 'https://account.r2.cloudflarestorage.com/private/making-video-music/luvia-gentle.wav' && !call[1]?.method)).toBe(true);
  expect(storageFetch.mock.calls.some(call => call[0].includes('public/making-video-music'))).toBe(false);
  expect(storageFetch.mock.calls.filter(call => call[1]?.method === 'DELETE')).toHaveLength(0);
});
it('fails a brand job clearly when the default track is not installed', async () => {
  Object.assign(jobs[0], { music_source: 'brand' });
  storageFetch.mockImplementation(async (url: string, options?: { method?: string }) =>
    new Response(options?.method ? null : 'mp4', { status: url.endsWith('luvia-gentle.wav') ? 404 : 200 }));
  await expect(processQueue(env, { encode })).rejects.toThrow('One or more video jobs failed');
  expect(encode).not.toHaveBeenCalled();
  expect(rpc.mock.calls.find(call => call[0] === 'finish_product_video')![1].p_error).toContain('Default Luvia music is not installed');
});
it('rejects a changed track size without processing or deleting retained music', async () => {
  Object.assign(jobs[0], { music_bytes: 4, music_type: 'audio/mpeg', music_mode: 'mix' });
  await expect(processQueue(env, { encode })).rejects.toThrow('One or more video jobs failed');
  expect(encode).not.toHaveBeenCalled();
  expect(rpc.mock.calls.find(call => call[0] === 'finish_product_video')![1].p_error).toContain('music size changed');
});
it('aborts the exact multipart upload before deleting a quiescent discarded draft', async () => {
  jobs = [];
  discarded = [{ id, writer_active: false, original_upload_id: 'opaque/id+value=' }];
  await processQueue(env, { encode });
  const first = storageFetch.mock.calls[0];
  expect(first[1].method).toBe('DELETE');
  expect(new URL(first[0]).searchParams.get('uploadId')).toBe('opaque/id+value=');
  expect(new URL(first[0]).pathname).toBe(`/private/making-videos/${id}/original.mp4`);
  expect(storageFetch.mock.calls[1][0]).toMatch(/original.mp4$/);
  expect(rpc).toHaveBeenCalledWith('finish_product_video_discard', { p_job_id: id });
});
it('records a multipart abort failure without deleting objects or confirming discard', async () => {
  jobs = [];
  discarded = [{ id, writer_active: false, original_upload_id: 'upload-fixture' }];
  storageFetch.mockResolvedValue(new Response(null, { status: 503 }));
  await expect(processQueue(env, { encode })).rejects.toThrow('Multipart abort failed');
  expect(storageFetch).toHaveBeenCalledTimes(1);
  expect(rpc).not.toHaveBeenCalledWith('finish_product_video_discard', { p_job_id: id });
  expect(rpc).toHaveBeenCalledWith('finish_product_video_discard', {
    p_job_id: id, p_error: expect.stringContaining('Multipart abort failed'),
  });
});
it('does not report successful cleanup when its final tombstone acknowledgement is false', async () => {
  jobs = [];
  discarded = [{ id, writer_active: false }];
  rpc.mockImplementation(async (name: string) => ({ data: name === 'claim_product_video' ? [] : false }));
  await expect(processQueue(env, { encode })).rejects.toThrow('cleanup was not confirmed');
  expect(rpc).toHaveBeenCalledWith('finish_product_video_discard', {
    p_job_id: id, p_error: expect.stringContaining('cleanup was not confirmed'),
  });
});
