import { afterEach, expect, it, vi } from 'vitest';
import { preparePinterestPin } from './pinterestShare';

vi.mock('./imageUploadConversion', () => ({
  prepareSocialPostJpeg: vi.fn().mockResolvedValue(new File(['photo'], 'photo.jpg', { type: 'image/jpeg' })),
}));

afterEach(() => vi.unstubAllGlobals());

it('reports a logo loading failure instead of producing an unbranded pin', async () => {
  vi.stubGlobal('Image', class {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) { queueMicrotask(() => this.onerror?.()); }
  });
  const createImageBitmap = vi.fn();
  vi.stubGlobal('createImageBitmap', createImageBitmap);
  await expect(preparePinterestPin({ name: 'Bag', image: 'https://images.example.test/bag.webp' }, 'Bag'))
    .rejects.toThrow('Pinterest logo could not be loaded');
  expect(createImageBitmap).not.toHaveBeenCalled();
});
