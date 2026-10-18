// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
const { rpc, serviceRpc, getUser, from, sign, storageFetch } = vi.hoisted(() => ({
  rpc: vi.fn(), serviceRpc: vi.fn(), getUser: vi.fn(), from: vi.fn(), sign: vi.fn(), storageFetch: vi.fn(),
}));
vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({
  createClient: (_url: string, _key: string, options?: { global?: unknown }) =>
    ({ rpc: options?.global ? rpc : serviceRpc, from, auth: { getUser } }),
}));
vi.mock('https://esm.sh/aws4fetch@1.0.20', () => ({ AwsClient: class { sign = sign; fetch = storageFetch; } }));
let handler: (request: Request) => Promise<Response>;
const id = '11111111-1111-4111-8111-111111111111';
let env: Record<string, string>;
let status = 'review';
let writer = false;
let music: Record<string, unknown> = {};
const request = (body: unknown, authorized = true) => new Request('https://example.test/product-videos', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(authorized ? { Authorization: 'Bearer fixture' } : {}) },
  body: JSON.stringify(body),
});
const uploadRequest = () => new Request(`https://example.test/product-videos?jobId=${id}`, {
  method: 'POST', headers: { Authorization: 'Bearer fixture', 'Content-Type': 'video/mp4', 'Content-Length': '1000' },
  body: new Uint8Array(1000),
});
const row = () => ({ id, lease: id, status, writer_active: writer, source_bytes: 1000,
  ...music,
  duration_seconds: 20, video_bytes: 2000, width: 1280, height: 720 });
beforeAll(async () => {
  vi.stubGlobal('Deno', { env: { get: (key: string) => env[key] },
    serve: (callback: typeof handler) => { handler = callback; } });
  await import('./index');
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.clearAllMocks(); status = 'review'; writer = false; music = {};
  env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'fixture', SUPABASE_SERVICE_ROLE_KEY: 'service-fixture',
    R2_ACCOUNT_ID: 'account', R2_ACCESS_KEY_ID: 'key', R2_SECRET_ACCESS_KEY: 'secret', R2_PUBLIC_URL: 'https://images.example.test',
    R2_BUCKET: 'public', R2_ORIGINALS_BUCKET: 'private' };
  getUser.mockResolvedValue({ data: { user: { id: 'admin' } } });
  rpc.mockImplementation(async (name: string) => {
    if (name === 'is_catalogue_admin') return { data: true };
    if (name === 'reserve_product_video') return { data: id };
    if (name === 'reserve_product_video_with_music') return { data: id };
    if (name === 'begin_product_video_upload') { status = 'receiving'; writer = true; }
    if (name === 'begin_product_video_publish') { status = 'publishing'; writer = true; }
    if (name === 'discard_product_video') status = 'discarding';
    return { data: [row()] };
  });
  serviceRpc.mockImplementation(async (name: string, args: { p_error?: string }) => {
    if (name === 'finish_product_video_discard') {
      if (writer || args.p_error) return { data: false };
      status = 'cancelled'; return { data: true };
    }
    writer = false;
    if (status === 'discarding' || status === 'cancelled') return { data: false };
    if (name === 'finish_product_video_publish' && status !== 'publishing') return { data: false };
    status = name === 'finish_product_video_publish' ? args.p_error ? 'review' : 'ready' : args.p_error ? 'failed' : 'queued';
    return { data: !args.p_error };
  });
  const query = { select: () => query, eq: () => query, single: async () => ({ data: row() }) };
  from.mockReturnValue(query);
  sign.mockImplementation(async (url: URL) => ({ url: `${url.toString()}&signature=fixture` }));
  storageFetch.mockImplementation(async (_url: string, options: { method: string }) =>
    new Response(options.method === 'PUT' ? '<CopyObjectResult/>' : null, { status: 200 }));
});
it('rejects unauthenticated and non-admin access before any storage operation', async () => {
  expect((await handler(request({}, false))).status).toBe(401);
  rpc.mockResolvedValue({ data: false });
  expect((await handler(request({ action: 'preview', jobId: id }))).status).toBe(403);
  expect(sign).not.toHaveBeenCalled(); expect(storageFetch).not.toHaveBeenCalled();
});
it('validates MIME, exact bounds and IDs before reserving jobs, and requires separate private storage', async () => {
  for (const patch of [{ size: 62914561 }, { size: 0 }, { size: 1.5 }, { type: 'video/quicktime' }, { productId: '../../public' }]) {
    expect((await handler(request({ action: 'prepare', productId: id, size: 1000, type: 'video/mp4', ...patch }))).status).toBe(400);
  }
  env.R2_ORIGINALS_BUCKET = 'public';
  expect((await handler(request({ action: 'prepare', productId: id, size: 1000, type: 'video/mp4' }))).status).toBe(503);
  expect(rpc.mock.calls.every(call => call[0] === 'is_catalogue_admin')).toBe(true);
});
it('uploads only bounded binary bytes under a safe private key and queues them without browser FFmpeg', async () => {
  expect((await handler(uploadRequest())).status).toBe(200);
  expect(storageFetch).toHaveBeenCalledWith(`https://account.r2.cloudflarestorage.com/private/making-videos/${id}/original.mp4`,
    expect.objectContaining({ method: 'PUT', body: expect.any(Uint8Array) }));
  expect(serviceRpc).toHaveBeenCalledWith('finish_product_video_upload', { p_job_id: id, p_lease: id, p_error: null });
  expect(sign).not.toHaveBeenCalled();
  expect(status).toBe('queued');
});
it('issues only five-minute GET previews from private storage for reviewable jobs', async () => {
  const response = await handler(request({ action: 'preview', jobId: id }));
  const data = await response.json();
  expect(data.videoUrl).toContain(`/private/making-videos/${id}/video.mp4?X-Amz-Expires=300`);
  expect(data.posterUrl).toContain('/private/');
  expect(data).toMatchObject({ durationSeconds: 20, videoBytes: 2000 });
  expect(sign.mock.calls.every(call => call[1].method === 'GET')).toBe(true);
  status = 'processing';
  expect((await handler(request({ action: 'preview', jobId: id }))).status).toBe(409);
});
it('copies the reviewed MP4 and poster server-side only on explicit publish, then atomically switches metadata', async () => {
  expect((await handler(request({ action: 'publish', jobId: id }))).status).toBe(200);
  const puts = storageFetch.mock.calls.filter(call => call[1].method === 'PUT');
  expect(puts).toHaveLength(2);
  expect(puts[0][1].headers['x-amz-copy-source']).toBe(`/private/making-videos/${id}/video.mp4`);
  expect(serviceRpc).toHaveBeenCalledWith('finish_product_video_publish', expect.objectContaining({
    p_video_url: `https://images.example.test/making-videos/${id}/video.mp4`, p_error: null,
  }));
  expect(storageFetch.mock.invocationCallOrder[1]).toBeLessThan(serviceRpc.mock.invocationCallOrder[0]);
  expect(status).toBe('ready');
});
it('returns a failed publication to private review without switching the existing public metadata', async () => {
  storageFetch.mockResolvedValueOnce(new Response('<CopyObjectResult/>'))
    .mockResolvedValueOnce(new Response('<Error>copy failed</Error>'));
  expect((await handler(request({ action: 'publish', jobId: id }))).status).toBe(400);
  expect(serviceRpc).toHaveBeenCalledWith('finish_product_video_publish', expect.objectContaining({
    p_error: expect.stringContaining('publication copy failed'),
  }));
  expect(status).toBe('review');
});
it('does not delete a successfully published clip when the database commit response is lost', async () => {
  serviceRpc.mockImplementationOnce(async () => {
    status = 'ready'; writer = false;
    throw new Error('Publication response lost');
  });
  expect(await (await handler(request({ action: 'publish', jobId: id }))).json()).toEqual({ published: true });
  expect(status).toBe('ready');
  expect(storageFetch.mock.calls.filter(call => call[1].method === 'DELETE')).toHaveLength(0);
});
it('explicit discard deletes the draft original, processed MP4 and poster, including unpublished copy attempts, not the current public video', async () => {
  const response = await handler(request({ action: 'discard', productId: id }));
  expect(await response.json()).toEqual({ discarded: true, pending: false });
  const deletes = storageFetch.mock.calls.filter(call => call[1].method === 'DELETE');
  expect(deletes.map(call => call[0])).toEqual([
    `https://account.r2.cloudflarestorage.com/private/making-videos/${id}/original.mp4`,
    `https://account.r2.cloudflarestorage.com/private/making-videos/${id}/music.bin`,
    `https://account.r2.cloudflarestorage.com/private/making-videos/${id}/video.mp4`,
    `https://account.r2.cloudflarestorage.com/private/making-videos/${id}/poster.webp`,
    `https://account.r2.cloudflarestorage.com/public/making-videos/${id}/video.mp4`,
    `https://account.r2.cloudflarestorage.com/public/making-videos/${id}/poster.webp`,
  ]);
  expect(rpc).not.toHaveBeenCalledWith('remove_product_video', expect.anything());
  expect(status).toBe('cancelled');
});
it('leaves cleanup failure visible and retryable, never returning successful discard first', async () => {
  storageFetch.mockResolvedValueOnce(new Response(null, { status: 503 }));
  const response = await handler(request({ action: 'discard', productId: id }));
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: expect.stringContaining('Retry discard') });
  expect(status).toBe('discarding');
  expect(serviceRpc).toHaveBeenCalledWith('finish_product_video_discard', { p_job_id: id, p_error: expect.stringContaining('HTTP 503') });
  expect(await (await handler(request({ action: 'discard', productId: id }))).json()).toEqual({ discarded: true, pending: false });
});
it('fences a concurrent original upload and confirms discard only after that writer cleans its late PUT', async () => {
  let release!: (value: Response) => void;
  const pending = new Promise<Response>(resolve => { release = resolve; });
  storageFetch.mockImplementation(async (url: string, options: { method: string }) =>
    options.method === 'PUT' && url.endsWith('original.mp4') ? pending : new Response(null));
  const uploading = handler(uploadRequest());
  await vi.waitFor(() => expect(storageFetch).toHaveBeenCalledWith(expect.stringContaining('original.mp4'), expect.objectContaining({ method: 'PUT' })));
  expect(await (await handler(request({ action: 'discard', productId: id }))).json()).toEqual({ discarded: false, pending: true });
  expect(status).toBe('discarding');
  release(new Response(null));
  expect((await uploading).status).toBe(400);
  expect(status).toBe('cancelled');
  expect(storageFetch.mock.calls.filter(call => call[1].method === 'DELETE')).toHaveLength(12);
});

it('fences publication racing with discard and cleans late public copies before confirming removal', async () => {
  let release!: (value: Response) => void;
  const pending = new Promise<Response>(resolve => { release = resolve; });
  storageFetch.mockImplementation(async (url: string, options: { method: string }) => {
    if (options.method === 'PUT' && url.endsWith('video.mp4')) return pending;
    if (options.method === 'PUT') return new Response('<Error>source discarded</Error>', { status: 404 });
    return new Response(null);
  });
  const publishing = handler(request({ action: 'publish', jobId: id }));
  await vi.waitFor(() => expect(storageFetch).toHaveBeenCalledWith(expect.stringContaining('/public/'), expect.objectContaining({ method: 'PUT' })));
  expect(await (await handler(request({ action: 'discard', productId: id }))).json()).toEqual({ discarded: false, pending: true });
  release(new Response('<CopyObjectResult/>'));
  expect((await publishing).status).toBe(400);
  expect(status).toBe('cancelled');
  expect(storageFetch.mock.calls.filter(call => call[1].method === 'DELETE')).toHaveLength(14);
  expect(serviceRpc).not.toHaveBeenCalledWith('finish_product_video_publish', expect.objectContaining({ p_error: null }));
});
const musicUploadRequest = () => new Request(`https://example.test/product-videos?jobId=${id}`, {
  method: 'POST', headers: { Authorization: '******', 'Content-Type': 'application/octet-stream' },
  body: new Uint8Array(1003),
});
it('validates music metadata and rights before reserving a music job', async () => {
  const valid = { size: 3, type: 'audio/mpeg', mode: 'mix', rightsConfirmed: true };
  for (const patch of [{ size: 20971521 }, { size: 0 }, { type: 'video/mp4' }, { mode: 'loud' }, { rightsConfirmed: false }]) {
    expect((await handler(request({ action: 'prepare', productId: id, size: 1000, type: 'video/mp4',
      music: { ...valid, ...patch } }))).status).toBe(400);
  }
  expect((await handler(request({ action: 'prepare', productId: id, size: 1000, type: 'video/mp4', music: valid }))).status).toBe(200);
  expect(rpc).toHaveBeenCalledWith('reserve_product_video_with_music', {
    p_product_id: id, p_bytes: 1000, p_music_bytes: 3, p_music_type: 'audio/mpeg',
    p_music_mode: 'mix', p_music_rights: true,
  });
});
it('stores a private bounded track before queuing and does not queue failed track uploads', async () => {
  music = { music_bytes: 3, music_type: 'audio/mpeg', music_mode: 'mix' };
  expect((await handler(musicUploadRequest())).status).toBe(200);
  const puts = storageFetch.mock.calls.filter(call => call[1].method === 'PUT');
  expect(puts.map(call => call[1].body.length)).toEqual([1000, 3]);
  expect(puts[1][0]).toContain('/private/making-videos/');
  expect(puts[1][0]).toMatch(/music.bin$/);
  storageFetch.mockImplementation(async (url: string) => new Response(null, { status: url.endsWith('music.bin') ? 503 : 200 }));
  expect((await handler(musicUploadRequest())).status).toBe(400);
  expect(status).toBe('failed');
});
it('cleans a late music PUT before confirming a concurrent discard', async () => {
  music = { music_bytes: 3, music_type: 'audio/mpeg', music_mode: 'mix' };
  let release!: (value: Response) => void;
  const pending = new Promise<Response>(resolve => { release = resolve; });
  storageFetch.mockImplementation(async (url: string, options: { method: string }) =>
    options.method === 'PUT' && url.endsWith('music.bin') ? pending : new Response(null));
  const uploading = handler(musicUploadRequest());
  await vi.waitFor(() => expect(storageFetch).toHaveBeenCalledWith(expect.stringContaining('music.bin'), expect.objectContaining({ method: 'PUT' })));
  expect(await (await handler(request({ action: 'discard', productId: id }))).json()).toEqual({ discarded: false, pending: true });
  release(new Response(null));
  expect((await uploading).status).toBe(400);
  expect(status).toBe('cancelled');
  expect(storageFetch.mock.calls.filter(call => call[1].method === 'DELETE')).toHaveLength(12);
});
