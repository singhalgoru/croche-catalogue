import { beforeEach, expect, it, vi } from 'vitest';
import { discardProductVideo, getProductVideoJob, previewProductVideo, publishProductVideo,
  removeProductVideo, reprocessProductVideo, uploadProductVideo, validateVideoFile, validateMusicFile } from './productVideos';
const { invoke, from } = vi.hoisted(() => ({ invoke: vi.fn(), from: vi.fn() }));
vi.mock('../lib/supabaseConfig', () => ({ loadSupabase: async () => ({ functions: { invoke }, from }) }));
const id = '11111111-1111-4111-8111-111111111111';
beforeEach(() => vi.clearAllMocks());
const file = () => new File(['mp4'], 'unsafe;$(command).mp4', { type: 'video/mp4' });
function mockUpload() {
  invoke.mockImplementation(async (_name: string, options: { body: { action?: string } }) => ({
    data: options.body.action === 'prepare' ? { jobId: id }
      : options.body.action === 'start' ? { started: true }
      : options.body.action === 'complete' ? { queued: true } : { uploaded: true },
  }));
}
it('rejects invalid formats, extensions, empty and oversized uploads before calling storage', async () => {
  for (const value of [new File(['x'], 'a.mov', { type: 'video/quicktime' }),
    new File(['x'], 'a.txt', { type: 'video/mp4' }), new File([], 'a.mp4', { type: 'video/mp4' }),
    { name: 'a.mp4', type: 'video/mp4', size: 524288001 } as File]) {
    expect(() => validateVideoFile(value)).toThrow('MP4');
    await expect(uploadProductVideo('p1', value)).rejects.toThrow('MP4');
  }
  expect(invoke).not.toHaveBeenCalled();
});
it('uploads binary media through the authenticated edge function, never an unrevocable public PUT URL', async () => {
  mockUpload();
  const video = file();
  expect(await uploadProductVideo('p1', video)).toBe(id);
  expect(invoke).toHaveBeenNthCalledWith(1, 'product-videos', {
    body: { action: 'prepare', productId: 'p1', size: 3, type: 'video/mp4' },
  });
  expect(invoke).toHaveBeenNthCalledWith(2, 'product-videos', { body: { action: 'start', jobId: id } });
  expect(invoke).toHaveBeenNthCalledWith(3, `product-videos?jobId=${id}&action=part&part=1`, {
    body: expect.any(Blob), headers: { 'Content-Type': 'application/octet-stream' },
  });
  expect(invoke.mock.calls[2][1].body.size).toBe(3);
  expect(invoke).toHaveBeenNthCalledWith(4, 'product-videos', { body: { action: 'complete', jobId: id } });
});
it('accepts MP4 filenames with missing or generic browser MIME and normalizes the upload metadata', async () => {
    for (const type of ['', 'application/octet-stream']) {
      mockUpload();
      await uploadProductVideo('p1', new File(['mp4'], 'recording.MP4', { type }));
      expect(invoke.mock.calls.at(-4)?.[1].body.type).toBe('video/mp4');
      expect(invoke.mock.calls.at(-2)?.[1].headers['Content-Type']).toBe('application/octet-stream');
    }
  });
  it('distinguishes size, empty-file and format failures with actionable file details', () => {
    expect(() => validateVideoFile({ name: 'large.mp4', type: 'video/mp4', size: 501 * 1024 * 1024 } as File))
      .toThrow('501.0 MB');
    expect(() => validateVideoFile({ name: 'phone.mp4', type: 'video/mp4', size: 80 * 1024 * 1024 } as File))
      .not.toThrow();
    expect(() => validateVideoFile(new File([], 'empty.mp4', { type: 'video/mp4' }))).toThrow('empty');
    expect(() => validateVideoFile(new File(['x'], 'phone.mov', { type: 'video/quicktime' }))).toThrow('renaming');
  });
it('surfaces upload failures explicitly', async () => {
  invoke.mockResolvedValueOnce({ data: { jobId: id } }).mockResolvedValueOnce({
    error: { message: 'Upload failed', context: new Response(JSON.stringify({ error: 'Private storage offline' })) },
  });
  await expect(uploadProductVideo('p1', file())).rejects.toThrow('Private storage offline');
});
it('validates music and permission before reservation and uploads music separately before completion', async () => {
  const track = new File(['music'], 'track.mp3', { type: 'audio/mpeg' });
  for (const bad of [new File([], 'a.mp3', { type: 'audio/mpeg' }),
    new File(['x'], 'a.mp4', { type: 'video/mp4' }), { name: 'a.wav', type: 'audio/wav', size: 20971521 } as File]) {
    expect(() => validateMusicFile(bad)).toThrow('20 MB');
  }
  await expect(uploadProductVideo('p1', file(), { file: track, rightsConfirmed: false }))
    .rejects.toThrow('permission');
  expect(invoke).not.toHaveBeenCalled();
  mockUpload();
  await uploadProductVideo('p1', file(), { file: track, rightsConfirmed: true });
  // Supplied music always replaces (removes) source audio; no mode choice exists.
  expect(invoke.mock.calls[0][1].body.music).toEqual({
    size: 5, type: 'audio/mpeg', mode: 'replace', rightsConfirmed: true,
  });
  const payload = invoke.mock.calls[3][1];
  expect(invoke.mock.calls[3][0]).toBe(`product-videos?jobId=${id}&action=music`);
  expect(payload.body).toBe(track);
  expect(payload.headers['Content-Type']).toBe('application/octet-stream');
});
it('requests the private Luvia default track without any browser music upload', async () => {
  mockUpload();
  await uploadProductVideo('p1', file(), { source: 'brand' });
  expect(invoke.mock.calls[0][1].body.music).toEqual({ source: 'brand' });
  expect(invoke.mock.calls.some(call => String(call[0]).includes('action=music'))).toBe(false);
  invoke.mockClear(); mockUpload();
  await uploadProductVideo('p1', file());
  expect(invoke.mock.calls[0][1].body.music).toBeUndefined();
});
it('reprocesses a review draft by ID with an explicit music option and requires confirmation', async () => {
  invoke.mockResolvedValueOnce({ data: { queued: true } });
  await reprocessProductVideo(id, 'brand');
  expect(invoke).toHaveBeenCalledWith('product-videos', { body: { action: 'reprocess', jobId: id, music: 'brand' } });
  invoke.mockResolvedValueOnce({ data: { queued: false } });
  await expect(reprocessProductVideo(id)).rejects.toThrow('not confirmed');
});
it('sends an exact 500 MB boundary file as sequential bounded slices without reading the original', async () => {
  mockUpload();
  const slice = vi.fn((start: number, end: number) => ({ size: end - start }));
  const video = { name: 'large.mp4', type: 'video/mp4', size: 500 * 1024 * 1024,
    slice, arrayBuffer: vi.fn(() => { throw new Error('Whole original must not be read'); }) } as unknown as File;
  await uploadProductVideo('p1', video);
  expect(slice).toHaveBeenCalledTimes(63);
  expect(slice).toHaveBeenLastCalledWith(496 * 1024 * 1024, 500 * 1024 * 1024);
  const parts = invoke.mock.calls.filter(call => call[0].includes('action=part'));
  expect(parts.every(call => call[1].body.size <= 8 * 1024 * 1024)).toBe(true);
  expect(parts.reduce((sum, call) => sum + call[1].body.size, 0)).toBe(video.size);
  expect(video.arrayBuffer).not.toHaveBeenCalled();
});
it('does not upload later parts or complete after a failed part', async () => {
  mockUpload();
  invoke.mockResolvedValueOnce({ data: { jobId: id } })
    .mockResolvedValueOnce({ data: { started: true } })
    .mockResolvedValueOnce({ data: { error: 'Part failed; discard and retry' } });
  const video = { name: 'large.mp4', type: 'video/mp4', size: 80 * 1024 * 1024,
    slice: () => new Blob(['part']) } as unknown as File;
  await expect(uploadProductVideo('p1', video)).rejects.toThrow('Part failed');
  expect(invoke).toHaveBeenCalledTimes(3);
});
it('keeps private preview, explicit publish, draft discard and public removal distinct', async () => {
  invoke.mockResolvedValueOnce({ data: { videoUrl: 'https://account.r2.cloudflarestorage.com/private/video.mp4',
    posterUrl: 'https://account.r2.cloudflarestorage.com/private/poster.webp',
    durationSeconds: 20, videoBytes: 2000, width: 1280, height: 720 } })
    .mockResolvedValueOnce({ data: { published: true } })
    .mockResolvedValueOnce({ data: { discarded: false, pending: true } })
    .mockResolvedValueOnce({ data: { removed: true } });
  await previewProductVideo(id);
  await publishProductVideo(id);
  expect(await discardProductVideo('p1')).toEqual({ discarded: false, pending: true });
  await removeProductVideo('p1');
  expect(invoke.mock.calls.map(call => call[1].body.action)).toEqual(['preview', 'publish', 'discard', 'remove']);
});
it('rejects unconfirmed mutations and malformed private previews instead of claiming success', async () => {
  invoke.mockResolvedValue({ data: {} });
  await expect(previewProductVideo(id)).rejects.toThrow('invalid media metadata');
  await expect(publishProductVideo(id)).rejects.toThrow('not confirmed');
  await expect(discardProductVideo('p1')).rejects.toThrow('not confirmed');
  await expect(removeProductVideo('p1')).rejects.toThrow('not confirmed');
});
it('exposes background status query errors', async () => {
  const query = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn(), maybeSingle: vi.fn() };
  for (const key of ['select', 'eq', 'order', 'limit'] as const) query[key].mockReturnValue(query);
  query.maybeSingle.mockResolvedValue({ error: { message: 'Permission denied' } });
  from.mockReturnValue(query);
  await expect(getProductVideoJob('p1')).rejects.toThrow('Permission denied');
});
