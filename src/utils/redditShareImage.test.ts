import { afterEach, expect, it, vi } from 'vitest';
import { getRedditShareImage } from './redditShareImage';
const prepare = vi.hoisted(() => vi.fn());
vi.mock('./shareImage', () => ({ getShareableImageFile: prepare, toShareFileName: () => 'rose' }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('converts WebP into a white-backed JPEG for Reddit and releases the bitmap', async () => {
  prepare.mockResolvedValue(new File(['webp'], 'rose.webp', { type: 'image/webp' }));
  const close = vi.fn();
  const bitmap = { width: 480, height: 480, close };
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
  const context = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(vi.fn().mockReturnValue(context));
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(new Blob(['jpeg'], { type: 'image/jpeg' })));
  const photo = await getRedditShareImage('/rose.webp', 'Rose');
  expect(photo.name).toBe('rose.jpg');
  expect(photo.type).toBe('image/jpeg');
  expect(context.fillStyle).toBe('#ffffff');
  expect(context.drawImage).toHaveBeenCalledWith(bitmap, 0, 0);
  expect(close).toHaveBeenCalledOnce();
});

it('leaves JPEG photos unchanged and reports download failures', async () => {
  const file = new File(['jpg'], 'rose.jpg', { type: 'image/jpeg' });
  prepare.mockResolvedValueOnce(file).mockResolvedValueOnce(null);
  expect(await getRedditShareImage('/rose.jpg', 'Rose')).toBe(file);
  await expect(getRedditShareImage('/missing.webp', 'Rose')).rejects.toThrow('Unable to load');
});
