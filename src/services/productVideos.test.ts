import { beforeEach, expect, it, vi } from 'vitest';
import { discardProductVideo, getProductVideoJob, previewProductVideo, publishProductVideo,
  removeProductVideo, uploadProductVideo, validateVideoFile } from './productVideos';
const { invoke, from } = vi.hoisted(() => ({ invoke: vi.fn(), from: vi.fn() }));
vi.mock('../lib/supabaseConfig', () => ({ loadSupabase: async () => ({ functions: { invoke }, from }) }));
const id = '11111111-1111-4111-8111-111111111111';
beforeEach(() => vi.clearAllMocks());
const file = () => new File(['mp4'], 'unsafe;$(command).mp4', { type: 'video/mp4' });
it('rejects invalid formats, extensions, empty and oversized uploads before calling storage', async () => {
  for (const value of [new File(['x'], 'a.mov', { type: 'video/quicktime' }),
    new File(['x'], 'a.txt', { type: 'video/mp4' }), new File([], 'a.mp4', { type: 'video/mp4' }),
    { name: 'a.mp4', type: 'video/mp4', size: 62914561 } as File]) {
    expect(() => validateVideoFile(value)).toThrow('MP4');
    await expect(uploadProductVideo('p1', value)).rejects.toThrow('MP4');
  }
  expect(invoke).not.toHaveBeenCalled();
});
it('uploads binary media through the authenticated edge function, never an unrevocable public PUT URL', async () => {
  invoke.mockResolvedValueOnce({ data: { jobId: id } }).mockResolvedValueOnce({ data: { queued: true } });
  const video = file();
  expect(await uploadProductVideo('p1', video)).toBe(id);
  expect(invoke).toHaveBeenNthCalledWith(1, 'product-videos', {
    body: { action: 'prepare', productId: 'p1', size: 3, type: 'video/mp4' },
  });
  expect(invoke).toHaveBeenNthCalledWith(2, `product-videos?jobId=${id}`, {
    body: video, headers: { 'Content-Type': 'video/mp4' },
  });
});
it('surfaces upload failures explicitly', async () => {
  invoke.mockResolvedValueOnce({ data: { jobId: id } }).mockResolvedValueOnce({
    error: { message: 'Upload failed', context: new Response(JSON.stringify({ error: 'Private storage offline' })) },
  });
  await expect(uploadProductVideo('p1', file())).rejects.toThrow('Private storage offline');
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
