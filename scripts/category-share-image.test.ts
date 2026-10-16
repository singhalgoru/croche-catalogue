import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, expect, it, vi } from 'vitest';
import { writeSocialImage } from './prerender.mjs';

const directories: string[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

it('writes a full-photo JPEG preview with static glowing dots and a content-versioned URL', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'luvia-category-share-'));
  directories.push(directory);
  const photo = await sharp({ create: { width: 600, height: 900, channels: 3, background: '#224455' } }).png().toBuffer();
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => photo })));
  const result = await writeSocialImage({ name: 'Decor', image: 'https://images.luviacreations.com/products/admin/look.webp' },
    directory, '/collections/decor/', [{ productId: 'rose', x: 25, y: 60 }]);
  expect(result).toMatchObject({ width: 573, height: 840 });
  expect(result!.url).toMatch(/^https:\/\/luviacreations.com\/collections\/decor\/og-[a-f0-9]{12}\.jpg$/);
  const filename = new URL(result!.url).pathname.split('/').at(-1)!;
  const image = await readFile(path.join(directory, filename));
  expect((await sharp(image).metadata()).format).toBe('jpeg');
  const pixel = await sharp(image).extract({ left: 153, top: 500, width: 1, height: 1 }).removeAlpha().raw().toBuffer();
  expect(pixel[0]).toBeGreaterThan(220);
  expect(pixel[1]).toBeGreaterThan(170);
  expect(pixel[2]).toBeLessThan(115);
  const changed = await writeSocialImage({ name: 'Decor', image: '/look.webp' }, directory, '/collections/decor/',
    [{ productId: 'rose', x: 75, y: 60 }]);
  expect(changed!.url).not.toBe(result!.url);
});

it('keeps existing product JPEG paths and logs an explicit warning on unavailable photos', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'luvia-category-share-'));
  directories.push(directory);
  const photo = await sharp({ create: { width: 200, height: 300, channels: 3, background: 'white' } }).png().toBuffer();
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => photo })));
  expect(await writeSocialImage({ name: 'Rose', image: '/rose.webp' }, directory, '/p/rose/')).toMatchObject({
    url: 'https://luviacreations.com/p/rose/og.jpg', width: 200, height: 300,
  });
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })));
  expect(await writeSocialImage({ name: 'Decor', image: '/missing.webp' }, directory, '/collections/decor/')).toBeNull();
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('HTTP 404'));
  expect(await readdir(directory)).toEqual(['og.jpg']);
});
