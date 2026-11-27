import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, expect, it, vi } from 'vitest';
import { buildInstagramSnapshot } from './instagram-snapshot.mjs';

const now = Date.now();
const post = {
  id: '123', permalink: 'https://www.instagram.com/p/abc/', previewUrl: 'https://scontent.cdninstagram.com/photo',
  caption: 'Crochet flower', timestamp: new Date(now).toISOString(), mediaType: 'IMAGE',
};
const feed = { username: 'luvia', posts: [post], fetchedAt: new Date(now).toISOString(), stale: false };
let dir: string;
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (dir) await rm(dir, { recursive: true, force: true });
});

it('writes validated, resized WebP posts and removes posts from a successful empty feed', async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'instagram-snapshot-'));
  const image = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#ff0000' } }).png().toBuffer();
  const fetchMock = vi.fn(async (url: string | URL) => String(url).includes('/functions/')
    ? Response.json(feed) : new Response(image));
  vi.stubGlobal('fetch', fetchMock);
  const result = await buildInstagramSnapshot('https://example.supabase.co', 'key', dir, now);
  expect(result.posts[0].previewUrl).toBe('/instagram-snapshot/123.webp');
  const metadata = await sharp(await readFile(path.join(dir, 'instagram-snapshot', '123.webp'))).metadata();
  expect([metadata.format, metadata.width, metadata.height]).toEqual(['webp', 480, 600]);
  expect((await sharp(await readFile(path.join(dir, 'instagram-snapshot', '123.jpg'))).metadata()).format).toBe('jpeg');
  fetchMock.mockImplementation(async () => Response.json({ ...feed, posts: [] }));
  const empty = await buildInstagramSnapshot('https://example.supabase.co', 'key', dir, now);
  expect(empty.posts).toEqual([]);
});

it('uses a bounded saved snapshot on API failure and rejects expired or unsafe snapshots', async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'instagram-snapshot-'));
  const image = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#ff0000' } }).webp().toBuffer();
  const saved = { ...feed, posts: [{ ...post, previewUrl: '/instagram-snapshot/123.webp' }] };
  const fetchMock = vi.fn(async (url: string | URL) => {
    if (String(url).includes('/functions/')) throw new Error('offline');
    return String(url).endsWith('feed.json') ? Response.json(saved) : new Response(image);
  });
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const result = await buildInstagramSnapshot('https://example.supabase.co', 'key', dir, now);
  expect(result.stale).toBe(true);
  expect(result.posts).toHaveLength(1);
  saved.fetchedAt = new Date(now - 49 * 60 * 60 * 1000).toISOString();
  expect(await buildInstagramSnapshot('https://example.supabase.co', 'key', dir, now)).toBeNull();
  saved.fetchedAt = new Date(now).toISOString();
  saved.posts[0].previewUrl = 'https://example.com/unsafe';
  expect(await buildInstagramSnapshot('https://example.supabase.co', 'key', dir, now)).toBeNull();
});

it('never downloads untrusted feed URLs and filters posts outside the 30-day window', async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'instagram-snapshot-'));
  const fetchMock = vi.fn(async (url: string | URL) => {
    if (String(url).includes('/functions/')) {
      return Response.json({ ...feed, posts: [{ ...post, previewUrl: 'https://example.com/image' }] });
    }
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  expect(await buildInstagramSnapshot('https://example.supabase.co', 'key', dir, now)).toBeNull();
  expect(fetchMock.mock.calls.some(([url]) => String(url).includes('example.com/image'))).toBe(false);
  fetchMock.mockImplementation(async () => Response.json({
    ...feed, posts: [{ ...post, timestamp: new Date(now - 31 * 24 * 60 * 60 * 1000).toISOString() }],
  }));
  expect((await buildInstagramSnapshot('https://example.supabase.co', 'key', dir, now)).posts).toEqual([]);
});
