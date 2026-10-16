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

it('writes a clean category preview without hotspot overlays or extra borders', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'luvia-category-share-'));
  directories.push(directory);
  const photo = await sharp({ create: { width: 600, height: 900, channels: 3, background: '#224455' } }).png().toBuffer();
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => photo })));
  const result = await writeSocialImage({ name: 'Decor', image: 'https://images.luviacreations.com/products/admin/look.webp' },
    directory, '/collections/decor/');
  expect(result).toMatchObject({ width: 533, height: 800 });
  expect(result!.url).toMatch(/^https:\/\/luviacreations.com\/collections\/decor\/og-[a-f0-9]{12}\.jpg$/);
  const filename = new URL(result!.url).pathname.split('/').at(-1)!;
  const image = await readFile(path.join(directory, filename));
  expect((await sharp(image).metadata()).format).toBe('jpeg');
  for (const left of [133, 137, 145]) {
    const pixel = await sharp(image).extract({ left, top: 480, width: 1, height: 1 }).removeAlpha().raw().toBuffer();
    expect(Math.abs(pixel[0] - 34)).toBeLessThan(20);
    expect(Math.abs(pixel[1] - 68)).toBeLessThan(20);
    expect(Math.abs(pixel[2] - 85)).toBeLessThan(20);
  }
  const changedPhoto = await sharp({ create: { width: 600, height: 900, channels: 3, background: '#995544' } }).png().toBuffer();
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => changedPhoto })));
  const changed = await writeSocialImage({ name: 'Decor', image: '/look.webp' }, directory, '/collections/decor/');
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
