import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fetchInstagramFeed, readInstagramSnapshot } from './instagramFeed';

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../lib/supabaseConfig', () => ({
  loadSupabase: async () => ({ functions: { invoke: mocks.invoke } }),
}));

beforeEach(() => mocks.invoke.mockReset());
afterEach(() => { document.getElementById('instagram-snapshot')?.remove(); vi.restoreAllMocks(); });

it('invokes the public feed function and validates its response', async () => {
  const fetchedAt = new Date().toISOString();
  mocks.invoke.mockResolvedValue({
    data: { username: 'luvia', posts: [], fetchedAt, stale: false },
    error: null,
  });
  await expect(fetchInstagramFeed()).resolves.toEqual({ username: 'luvia', posts: [], fetchedAt, stale: false });
  expect(mocks.invoke).toHaveBeenCalledWith('instagram-feed', { body: {} });
});

it('surfaces invocation errors and rejects malformed feed data', async () => {
  mocks.invoke.mockResolvedValue({ data: null, error: { message: 'function unavailable' } });
  await expect(fetchInstagramFeed()).rejects.toThrow('function unavailable');
  mocks.invoke.mockResolvedValue({ data: { username: 'invalid username', posts: [], fetchedAt: new Date().toISOString(), stale: false }, error: null });
  await expect(fetchInstagramFeed()).rejects.toThrow('invalid response');
});

it('reads recent same-origin snapshots and rejects expired or unsafe images', () => {
  const script = document.createElement('script');
  script.id = 'instagram-snapshot';
  document.head.append(script);
  const snapshot = {
    username: 'luvia', fetchedAt: new Date().toISOString(), stale: false,
    posts: [{ id: '123', permalink: 'https://www.instagram.com/p/abc/', previewUrl: '/instagram-snapshot/123.webp',
      caption: 'Crochet flower', mediaType: 'IMAGE', timestamp: new Date().toISOString() }],
  };
  script.textContent = JSON.stringify(snapshot);
  expect(readInstagramSnapshot()?.posts[0].previewUrl).toBe('/instagram-snapshot/123.webp');
  expect(readInstagramSnapshot()?.stale).toBe(true);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  snapshot.posts[0].previewUrl = 'https://example.com/image';
  script.textContent = JSON.stringify(snapshot);
  expect(readInstagramSnapshot()).toBeNull();
  snapshot.posts[0].previewUrl = '/instagram-snapshot/123.webp';
  snapshot.fetchedAt = new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString();
  script.textContent = JSON.stringify(snapshot);
  expect(readInstagramSnapshot()).toBeNull();
});
