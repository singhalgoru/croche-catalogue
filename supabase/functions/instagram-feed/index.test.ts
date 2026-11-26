// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchInstagramFeed: vi.fn(), loadMetaAccess: vi.fn(), readCache: vi.fn(), saveCache: vi.fn(),
}));
vi.mock('./meta.ts', async original => ({
  ...await original<typeof import('./meta')>(),
  fetchInstagramFeed: mocks.fetchInstagramFeed,
}));
vi.mock('../_shared/loadMetaAccess.ts', () => ({ loadMetaAccess: mocks.loadMetaAccess }));
vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: mocks.readCache }) }),
      upsert: mocks.saveCache,
    }),
  }),
}));

const now = Date.now();
const env: Record<string, string> = {
  SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-fixture', META_PAGE_ID: '456',
};
let handle: (request: Request) => Promise<Response>;
const request = () => new Request('https://example.test/instagram-feed', { method: 'POST' });
const post = {
  id: '789', permalink: 'https://www.instagram.com/p/abc/', previewUrl: 'https://scontent.cdninstagram.com/preview.jpg',
  caption: 'Made by hand', mediaType: 'IMAGE', timestamp: new Date(now - 1000).toISOString(),
};

beforeAll(async () => {
  vi.stubGlobal('Deno', {
    env: { get: (name: string) => env[name] },
    serve: (handler: typeof handle) => { handle = handler; },
  });
  await import('./index');
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.resetAllMocks();
  mocks.readCache.mockResolvedValue({ data: null, error: null });
  mocks.saveCache.mockResolvedValue({ error: null });
  mocks.loadMetaAccess.mockResolvedValue({ config: { accessToken: 'token-fixture', accountId: '123', graphApiVersion: 'v27.0' } });
  mocks.fetchInstagramFeed.mockResolvedValue({ username: 'luvia', posts: [post] });
  env.META_PAGE_ID = '456';
});

it('refreshes Meta data when the cache is empty and stores only public feed data', async () => {
  const response = await handle(request());
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body).toMatchObject({ username: 'luvia', posts: [post], stale: false });
  expect(JSON.stringify(body)).not.toContain('token-fixture');
  expect(mocks.fetchInstagramFeed).toHaveBeenCalledOnce();
  expect(mocks.saveCache).toHaveBeenCalledWith(expect.objectContaining({ id: true, username: 'luvia', posts: [post] }));
});

it('serves a fresh cache without contacting Meta', async () => {
  mocks.readCache.mockResolvedValue({
    data: { username: 'luvia', posts: [post], fetched_at: new Date(now - 10 * 60 * 1000).toISOString() }, error: null,
  });
  const response = await handle(request());
  expect((await response.json()).posts).toEqual([post]);
  expect(mocks.fetchInstagramFeed).not.toHaveBeenCalled();
});

it('returns explicitly stale cached posts if Meta refresh fails', async () => {
  mocks.readCache.mockResolvedValue({
    data: { username: 'luvia', posts: [post], fetched_at: new Date(now - 2 * 60 * 60 * 1000).toISOString() }, error: null,
  });
  mocks.fetchInstagramFeed.mockRejectedValue(new Error('Meta permission expired.'));
  const response = await handle(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ stale: true, posts: [post] });
});

it('returns an unavailable error when there is no cache and Meta fails', async () => {
  mocks.fetchInstagramFeed.mockRejectedValue(new Error('Meta permission expired.'));
  const response = await handle(request());
  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({ error: expect.stringContaining('temporarily unavailable') });
});
