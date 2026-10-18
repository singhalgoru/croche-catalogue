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
let transfer: Record<string, unknown> = {};
const request = (body: unknown, authorized = true) => new Request('https://example.test/product-videos', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(authorized ? { Authorization: 'Bearer fixture' } : {}) },
  body: JSON.stringify(body),
});
const uploadRequest = () => new Request(`https://example.test/product-videos?jobId=${id}`, {
  method: 'POST', headers: { Authorization: 'Bearer fixture', 'Content-Type': 'video/mp4', 'Content-Length': '1000' },
  body: new Uint8Array(1000),
});
const row = () => ({ id, lease: id, status, writer_active: writer, source_bytes: 1000,
  ...music, ...transfer,
  duration_seconds: 20, video_bytes: 2000, width: 1280, height: 720 });
beforeAll(async () => {
  vi.stubGlobal('Deno', { env: { get: (key: string) => env[key] },
    serve: (callback: typeof handler) => { handler = callback; } });
  await import('./index');
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.clearAllMocks(); status = 'review'; writer = false; music = {}; transfer = { original_parts: [] };
  env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'fixture', SUPABASE_SERVICE_ROLE_KEY: 'service-fixture',
    R2_ACCOUNT_ID: 'account', R2_ACCESS_KEY_ID: 'key', R2_SECRET_ACCESS_KEY: 'secret', R2_PUBLIC_URL: 'https://images.example.test',
    R2_BUCKET: 'public', R2_ORIGINALS_BUCKET: 'private' };
  getUser.mockResolvedValue({ data: { user: { id: 'admin' } } });
  rpc.mockImplementation(async (name: string, args?: { p_operation?: string; p_part?: number }) => {
    if (name === 'is_catalogue_admin') return { data: true };
    if (name === 'reserve_product_video') return { data: id };
    if (name === 'reserve_product_video_with_music') return { data: id };
    if (name === 'reserve_product_video_with_brand_music') return { data: id };
    if (name === 'reprocess_product_video') { status = 'queued'; return { data: true }; }
    if (name === 'begin_product_video_upload') { status = 'receiving'; writer = true; }
    if (name === 'claim_product_video_transfer') {
      if (status !== 'receiving' || writer || !transfer.original_upload_id ||
        (args?.p_operation === 'part' && args.p_part !== (transfer.original_parts as string[]).length + 1) ||
        (args?.p_operation === 'complete' && ((transfer.original_parts as string[]).length !==
          Math.ceil(Number(row().source_bytes) / (8 * 1024 * 1024)) || (music.music_bytes && !transfer.music_uploaded)))) {
        return { error: { message: 'Upload is unavailable or incomplete.' } };
      }
      writer = true;
    }
    if (name === 'begin_product_video_publish') { status = 'publishing'; writer = true; }
    if (name === 'discard_product_video') status = 'discarding';
    return { data: [row()] };
  });
  serviceRpc.mockImplementation(async (name: string, args: {
    p_error?: string; p_operation?: string; p_upload_id?: string; p_etag?: string;
  }) => {
    if (name === 'finish_product_video_discard') {
      if (writer || args.p_error) return { data: false };
      status = 'cancelled'; return { data: true };
    }
    if (name === 'finish_product_video_transfer') {
      if (!writer) return { data: false };
      writer = false;
      if (args.p_upload_id) transfer.original_upload_id = args.p_upload_id;
      if (status !== 'receiving') return { data: false };
      if (args.p_error) { status = 'failed'; return { data: false }; }
      if (args.p_operation === 'part') (transfer.original_parts as string[]).push(args.p_etag!);
      if (args.p_operation === 'music') transfer.music_uploaded = true;
      return { data: true };
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
  storageFetch.mockImplementation(async (url: string, options: { method: string }) =>
    new Response(url.endsWith('?uploads') ? '<InitiateMultipartUploadResult><UploadId>upload-fixture</UploadId></InitiateMultipartUploadResult>'
      : options.method === 'POST' ? '<CompleteMultipartUploadResult/>'
      : options.method === 'PUT' ? '<CopyObjectResult/>' : null,
    { status: 200, headers: { etag: '"0123456789abcdef0123456789abcdef"' } }));
});
it('rejects unauthenticated and non-admin access before any storage operation', async () => {
  expect((await handler(request({}, false))).status).toBe(401);
  rpc.mockResolvedValue({ data: false });
  expect((await handler(request({ action: 'preview', jobId: id }))).status).toBe(403);
  expect(sign).not.toHaveBeenCalled(); expect(storageFetch).not.toHaveBeenCalled();
});
it('validates MIME, exact bounds and IDs before reserving jobs, and requires separate private storage', async () => {
  for (const patch of [{ size: 524288001 }, { size: 0 }, { size: 1.5 }, { type: 'video/quicktime' }, { productId: '../../public' }]) {
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
  expect(storageFetch.mock.calls.filter(call => call[1].method === 'DELETE')).toHaveLength(6);
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
  expect(storageFetch.mock.calls.filter(call => call[1].method === 'DELETE')).toHaveLength(8);
  expect(serviceRpc).not.toHaveBeenCalledWith('finish_product_video_publish', expect.objectContaining({ p_error: null }));
});
const musicUploadRequest = () => new Request(`https://example.test/product-videos?jobId=${id}`, {
  method: 'POST', headers: { Authorization: '******', 'Content-Type': 'application/octet-stream' },
  body: new Uint8Array(1003),
});
it('validates music metadata and rights, always reserving supplied music as replace', async () => {
  const valid = { size: 3, type: 'audio/mpeg', mode: 'replace', rightsConfirmed: true };
  for (const patch of [{ size: 20971521 }, { size: 0 }, { type: 'video/mp4' }, { mode: 'loud' }, { rightsConfirmed: false }]) {
    expect((await handler(request({ action: 'prepare', productId: id, size: 1000, type: 'video/mp4',
      music: { ...valid, ...patch } }))).status).toBe(400);
  }
  // An older open admin tab may still send 'mix': it is stored and encoded as replace.
  for (const mode of ['replace', 'mix', undefined]) {
    expect((await handler(request({ action: 'prepare', productId: id, size: 1000, type: 'video/mp4',
      music: { ...valid, mode } }))).status).toBe(200);
  }
  expect(rpc.mock.calls.filter(call => call[0] === 'reserve_product_video_with_music').map(call => call[1]))
    .toEqual(Array(3).fill({ p_product_id: id, p_bytes: 1000, p_music_bytes: 3, p_music_type: 'audio/mpeg',
      p_music_mode: 'replace', p_music_rights: true }));
});
it('reserves the private default track without any music upload metadata', async () => {
  const response = await handler(request({ action: 'prepare', productId: id, size: 1000, type: 'video/mp4',
    music: { source: 'brand' } }));
  expect(await response.json()).toEqual({ jobId: id });
  expect(rpc).toHaveBeenCalledWith('reserve_product_video_with_brand_music', { p_product_id: id, p_bytes: 1000 });
  expect(rpc).not.toHaveBeenCalledWith('reserve_product_video_with_music', expect.anything());
  expect(storageFetch).not.toHaveBeenCalled();
});
it('reprocesses a review draft through the admin RPC only, without storage or public changes', async () => {
  for (const body of [{ jobId: '../x' }, { jobId: id, music: 'loud' }]) {
    expect((await handler(request({ action: 'reprocess', ...body }))).status).toBe(400);
  }
  expect(await (await handler(request({ action: 'reprocess', jobId: id, music: 'brand' }))).json()).toEqual({ queued: true });
  expect(rpc).toHaveBeenCalledWith('reprocess_product_video', { p_job_id: id, p_music: 'brand' });
  await handler(request({ action: 'reprocess', jobId: id }));
  expect(rpc).toHaveBeenLastCalledWith('reprocess_product_video', { p_job_id: id, p_music: 'keep' });
  expect(storageFetch).not.toHaveBeenCalled(); expect(sign).not.toHaveBeenCalled();
  rpc.mockImplementation(async (name: string) => name === 'is_catalogue_admin' ? { data: true }
    : { error: { message: 'Only a private draft awaiting review can be reprocessed.' } });
  const rejected = await handler(request({ action: 'reprocess', jobId: id }));
  expect(rejected.status).toBe(400);
  expect((await rejected.json()).error).toContain('awaiting review');
  rpc.mockResolvedValue({ data: false });
  expect((await handler(request({ action: 'reprocess', jobId: id }))).status).toBe(403);
});
const wav = (bytes = 64, channels = 2, rate = 22050) => {
  const data = new Uint8Array(44 + bytes);
  const view = new DataView(data.buffer);
  data.set(new TextEncoder().encode('RIFF'), 0); view.setUint32(4, 36 + bytes, true);
  data.set(new TextEncoder().encode('WAVEfmt '), 8); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, channels, true); view.setUint32(24, rate, true);
  view.setUint32(28, rate * channels * 2, true); view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true);
  data.set(new TextEncoder().encode('data'), 36); view.setUint32(40, bytes, true);
  return data;
};
const install = (body: Uint8Array, authorization = 'Bearer service-fixture', type = 'audio/wav', length = String(body.length)) =>
  new Request('https://example.test/product-videos?action=install-brand-music', {
    method: 'POST', headers: { Authorization: authorization, 'Content-Type': type, 'Content-Length': length }, body,
  });
it('installs the private default track only for the service role, at a fixed private key', async () => {
  const response = await handler(install(wav()));
  expect(await response.json()).toEqual({ installed: true, bytes: 108 });
  expect(storageFetch).toHaveBeenCalledOnce();
  const [url, options] = storageFetch.mock.calls[0];
  expect(url).toBe('https://account.r2.cloudflarestorage.com/private/making-video-music/luvia-gentle.wav');
  expect(options).toMatchObject({ method: 'PUT', headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'private, no-store' } });
  expect(getUser).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
});
it('rejects admin/anon credentials, non-WAV bytes, wrong MIME and oversized tracks before storage', async () => {
  for (const [req, code] of [
    [install(wav(), 'Bearer admin-user-jwt'), 403], [install(wav(), ''), 403],
    [install(wav(), 'Bearer service-fixtur'), 403], [install(wav(), 'Bearer service-fixture2'), 403],
    [install(wav(), 'Bearer service-fixture', 'audio/mpeg'), 400],
    [install(wav(), 'Bearer service-fixture', 'audio/wav', String(20 * 1024 * 1024 + 1)), 400],
    [install(new TextEncoder().encode('ID3'.padEnd(64, 'x'))), 400],
    [install(wav(64, 6)), 400], [install(wav(64, 2, 192000)), 400], [install(wav(0)), 400],
  ] as const) expect((await handler(req)).status).toBe(code);
  expect(storageFetch).not.toHaveBeenCalled();
  env.R2_ORIGINALS_BUCKET = 'public';
  expect((await handler(install(wav()))).status).toBe(503);
  env.SUPABASE_SERVICE_ROLE_KEY = '';
  expect((await handler(install(wav(), 'Bearer '))).status).toBe(403);
  expect(storageFetch).not.toHaveBeenCalled();
});
it('accepts a gateway-verified service_role JWT even when the env key uses another format', async () => {
  const jwt = (role: string) => `Bearer h.${btoa(JSON.stringify({ role })).replace(/=/g, '')}.s`;
  expect((await handler(install(wav(), jwt('authenticated')))).status).toBe(403);
  expect((await handler(install(wav(), jwt('anon')))).status).toBe(403);
  expect(storageFetch).not.toHaveBeenCalled();
  expect((await handler(install(wav(), jwt('service_role')))).status).toBe(200);
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
  expect(storageFetch.mock.calls.filter(call => call[1].method === 'DELETE')).toHaveLength(6);
});

const etag = '"0123456789abcdef0123456789abcdef"';
function receiving(parts: string[] = []) {
  status = 'receiving';
  transfer = { original_upload_id: 'upload-fixture', original_parts: [...parts] };
}
function partRequest(chunks: number[], part = 1, action = 'part') {
  return new Request(`https://example.test/product-videos?jobId=${id}&action=${action}&part=${part}`, {
    method: 'POST', headers: { Authorization: '******', 'Content-Type': 'application/octet-stream' },
    body: new ReadableStream<Uint8Array>({
      pull(controller) {
        const length = chunks.shift();
        if (length === undefined) controller.close();
        else controller.enqueue(new Uint8Array(length));
      },
    }), duplex: 'half',
  } as RequestInit);
}
it('accepts originals above the old cap through the exact 500 MB boundary', async () => {
  for (const size of [60 * 1024 * 1024 + 1, 500 * 1024 * 1024]) {
    expect((await handler(request({ action: 'prepare', productId: id, type: 'video/mp4', size }))).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('reserve_product_video', { p_product_id: id, p_bytes: size });
  }
});
it('initiates a private multipart upload and persists its ID without granting browser upload credentials', async () => {
  expect(await (await handler(request({ action: 'start', jobId: id }))).json()).toEqual({ started: true });
  expect(transfer.original_upload_id).toBe('upload-fixture');
  expect(status).toBe('receiving'); expect(writer).toBe(false);
  expect(sign).not.toHaveBeenCalled();
  expect(serviceRpc).toHaveBeenCalledWith('finish_product_video_transfer', expect.objectContaining({
    p_operation: 'start', p_upload_id: 'upload-fixture', p_error: null,
  }));
});
it('reads a real streamed 8 MB part exactly, and persists its R2 ETag for ordered completion', async () => {
  receiving();
  transfer.source_bytes = 500 * 1024 * 1024;
  expect(await (await handler(partRequest(Array(64).fill(128 * 1024)))).json()).toEqual({ uploaded: true });
  const [url, options] = storageFetch.mock.calls[0];
  expect(new URL(url).searchParams.get('partNumber')).toBe('1');
  expect(new URL(url).searchParams.get('uploadId')).toBe('upload-fixture');
  expect(options.body.byteLength).toBe(8 * 1024 * 1024);
  expect(transfer.original_parts).toEqual([etag]);
  expect(writer).toBe(false); expect(status).toBe('receiving');
});
it('rejects truncated/oversized streamed parts and releases failed writers without touching storage', async () => {
  for (const chunks of [[999], [500, 501]]) {
    receiving();
    const response = await handler(partRequest(chunks));
    expect(response.status).toBe(400); expect(writer).toBe(false); expect(status).toBe('failed');
  }
  expect(storageFetch).not.toHaveBeenCalled();
});
it('releases a failed part writer when storage fails or returns no usable ETag', async () => {
  for (const response of [new Response(null, { status: 503 }), new Response(null)]) {
    receiving();
    storageFetch.mockResolvedValueOnce(response);
    expect((await handler(partRequest([1000]))).status).toBe(400);
    expect(writer).toBe(false); expect(status).toBe('failed');
    expect(transfer.original_parts).toEqual([]);
  }
});
it('preserves the exact upload ID and releases initiation after registration and abort failures so discard can retry', async () => {
  serviceRpc.mockRejectedValueOnce(new Error('Registration unavailable'));
  storageFetch.mockResolvedValueOnce(new Response('<InitiateMultipartUploadResult><UploadId>upload-fixture</UploadId></InitiateMultipartUploadResult>'))
    .mockResolvedValueOnce(new Response(null, { status: 503 }));
  expect((await handler(request({ action: 'start', jobId: id }))).status).toBe(400);
  expect(status).toBe('failed'); expect(writer).toBe(false);
  expect(transfer.original_upload_id).toBe('upload-fixture');
  expect(await (await handler(request({ action: 'discard', productId: id }))).json())
    .toEqual({ discarded: true, pending: false });
});
it('rejects duplicate/out-of-order parts, incomplete completion and late transfers before storage writes', async () => {
  receiving();
  expect((await handler(partRequest([1000], 2))).status).toBe(400);
  expect((await handler(request({ action: 'complete', jobId: id }))).status).toBe(400);
  receiving([etag]); music = { music_bytes: 3 };
  expect((await handler(request({ action: 'complete', jobId: id }))).status).toBe(400);
  status = 'discarding';
  expect((await handler(partRequest([1000]))).status).toBe(400);
  expect(storageFetch).not.toHaveBeenCalled();
});
it('uploads optional music separately and completes only the server-stored ordered ETags before queueing', async () => {
  receiving([etag]); music = { music_bytes: 3, music_type: 'audio/mpeg', music_mode: 'mix' };
  expect((await handler(partRequest([1, 2], 1, 'music'))).status).toBe(200);
  expect(transfer.music_uploaded).toBe(true);
  expect(await (await handler(request({ action: 'complete', jobId: id, parts: ['untrusted'] }))).json())
    .toEqual({ queued: true, jobId: id });
  expect(storageFetch.mock.calls[1][1].body).toContain(`<PartNumber>1</PartNumber><ETag>${etag}</ETag>`);
  expect(storageFetch.mock.calls[1][1].body).not.toContain('untrusted');
  expect(status).toBe('queued'); expect(writer).toBe(false);
});
it('does not queue a 200 response containing a multipart completion error', async () => {
  receiving([etag]);
  storageFetch.mockResolvedValueOnce(new Response('<Error><Code>InvalidPart</Code></Error>'));
  expect((await handler(request({ action: 'complete', jobId: id }))).status).toBe(400);
  expect(status).toBe('failed'); expect(writer).toBe(false);
  expect(serviceRpc).not.toHaveBeenCalledWith('finish_product_video_upload', expect.objectContaining({ p_error: null }));
});
it.each(['part', 'complete', 'start'])('fences discard during a late multipart %s and deletes only after its writer returns', async (operation) => {
  receiving(operation === 'complete' ? [etag] : []);
  let release!: (value: Response) => void;
  const pending = new Promise<Response>(resolve => { release = resolve; });
  storageFetch.mockImplementation(async (_url: string, options: { method: string }) =>
    options.method === 'DELETE' ? new Response(null) : pending);
  const uploading = handler(operation === 'part' ? partRequest([1000]) : request({ action: operation, jobId: id }));
  await vi.waitFor(() => expect(storageFetch).toHaveBeenCalledTimes(1));
  expect(await (await handler(request({ action: 'discard', productId: id }))).json())
    .toEqual({ discarded: false, pending: true });
  expect(storageFetch.mock.calls.filter(call => call[1].method === 'DELETE')).toHaveLength(0);
  release(new Response(operation === 'complete' ? '<CompleteMultipartUploadResult/>' : operation === 'start'
    ? '<InitiateMultipartUploadResult><UploadId>upload-fixture</UploadId></InitiateMultipartUploadResult>' : null,
  { headers: { etag } }));
  expect((await uploading).status).toBe(400);
  expect(status).toBe('cancelled'); expect(writer).toBe(false);
  const deletes = storageFetch.mock.calls.filter(call => call[1].method === 'DELETE');
  expect(new URL(deletes[0][0]).searchParams.get('uploadId')).toBe('upload-fixture');
  expect(deletes.some(call => call[0].endsWith(`/making-videos/${id}/original.mp4`))).toBe(true);
  expect(deletes.every(call => new URL(call[0]).pathname.includes(`/making-videos/${id}/`))).toBe(true);
});
it.each([503, 404])('keeps discard retryable on multipart abort HTTP %s and never falsely confirms deletion', async (httpStatus) => {
  receiving();
  storageFetch.mockResolvedValueOnce(new Response('<Error><Code>NoSuchBucket</Code></Error>', { status: httpStatus }));
  const response = await handler(request({ action: 'discard', productId: id }));
  expect(response.status).toBe(400); expect(status).toBe('discarding');
  expect(storageFetch).toHaveBeenCalledTimes(1);
  expect(await (await handler(request({ action: 'discard', productId: id }))).json())
    .toEqual({ discarded: true, pending: false });
});
it('allows an already completed/aborted multipart ID only on an explicit NoSuchUpload response', async () => {
  receiving([etag]); status = 'review';
  storageFetch.mockResolvedValueOnce(new Response('<Error><Code>NoSuchUpload</Code></Error>', { status: 404 }));
  expect(await (await handler(request({ action: 'discard', productId: id }))).json())
    .toEqual({ discarded: true, pending: false });
  expect(storageFetch.mock.calls.filter(call => call[1].method === 'DELETE')).toHaveLength(7);
});
it('rejects unknown object deletion 404 errors instead of claiming successful cleanup', async () => {
  storageFetch.mockResolvedValueOnce(new Response('<Error><Code>NoSuchBucket</Code></Error>', { status: 404 }));
  expect((await handler(request({ action: 'discard', productId: id }))).status).toBe(400);
  expect(status).toBe('discarding');
});
it('refuses a large legacy one-shot upload before allocating or sending its body', async () => {
  transfer.source_bytes = 500 * 1024 * 1024;
  expect((await handler(uploadRequest())).status).toBe(400);
  expect(storageFetch).not.toHaveBeenCalled(); expect(writer).toBe(false);
});
