// @vitest-environment node
import { access, writeFile } from 'node:fs/promises';
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
let jobs: { id: string; lease: string; source_bytes: number; music_bytes?: number; music_type?: string; music_mode?: string }[];
let publish = true;
let discarded: { id: string; writer_active: boolean }[] = [];
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
  jobs = [{ id, lease: id, source_bytes: 3 }];
  rpc.mockImplementation(async (name: string, args: { p_error?: string }) => ({
    data: name === 'claim_product_video' ? jobs.splice(0, 1) : args?.p_error ? false : publish, error: null,
  }));
  let filter = '';
  const query = { select: () => query, eq: (_column: string, value: string) => { filter = value; return query; },
    limit: async () => ({ data: filter === 'discarding' ? discarded : jobs.filter(() => true), error: null }) };
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
  Object.assign(jobs[0], { music_bytes: 3, music_type: 'audio/mpeg', music_mode: 'mix' });
  await processQueue(env, { encode });
  expect(encode.mock.calls[0][4]).toEqual({
    path: resolve('.video-processing', id, 'music.bin'), type: 'audio/mpeg', mode: 'mix',
  });
  expect(storageFetch.mock.calls.some(call => call[0].endsWith('/music.bin'))).toBe(true);
  expect(storageFetch.mock.calls.filter(call => call[1]?.method === 'DELETE')).toHaveLength(0);
});
it('rejects a changed track size without processing or deleting retained music', async () => {
  Object.assign(jobs[0], { music_bytes: 4, music_type: 'audio/mpeg', music_mode: 'mix' });
  await expect(processQueue(env, { encode })).rejects.toThrow('One or more video jobs failed');
  expect(encode).not.toHaveBeenCalled();
  expect(rpc.mock.calls.find(call => call[0] === 'finish_product_video')![1].p_error).toContain('music size changed');
});
