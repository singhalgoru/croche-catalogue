import JSZip from 'jszip';
import { afterEach, expect, it, vi } from 'vitest';
import { makePinterestDownload } from './pinterestPhotoDownload';

const variants = [
  { id: 'v1', name: 'Pink', label: 'Headband - Pink', image: '/pink.webp' },
  { id: 'v2', name: 'Blue', label: 'Headband - Blue', image: '/blue.jpg' },
];

afterEach(() => vi.unstubAllGlobals());

it('downloads a ZIP with each full website photo and its matching variant prompt', async () => {
  const fetchMock = vi.fn(async (url: string) => ({
    ok: true, headers: new Headers({ 'content-type': url.endsWith('.webp') ? 'image/webp' : 'image/jpeg' }),
    arrayBuffer: async () => new TextEncoder().encode(url).buffer,
  }));
  vi.stubGlobal('fetch', fetchMock);
  const zip = await JSZip.loadAsync(await makePinterestDownload(variants, vi.fn()));
  expect(fetchMock.mock.calls.map(call => call[0])).toEqual(['/pink.webp', '/blue.jpg']);
  expect(await zip.file('Headband - Pink - v1.webp')?.async('string')).toBe('/pink.webp');
  expect(await zip.file('Headband - Blue - v2.jpg')?.async('string')).toBe('/blue.jpg');
  expect(await zip.file('Headband - Pink - v1.txt')?.async('string')).toContain('Product variant: Pink.');
  expect(await zip.file('Headband - Blue - v2.txt')?.async('string')).toContain('Product variant: Blue.');
});

it('reports a failed photo instead of producing an incomplete archive', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));
  await expect(makePinterestDownload(variants, vi.fn())).rejects.toThrow('Unable to download Headband - Pink: photo request failed (403).');
});
