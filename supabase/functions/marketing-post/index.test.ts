// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { SocialPlatform, SocialPost } from '../_shared/socialPosts';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), rpc: vi.fn(), loadMetaAccess: vi.fn(), readProduct: vi.fn(), readPosts: vi.fn(), readMany: vi.fn(),
  insert: vi.fn(), checkpoint: vi.fn(), storePostImage: vi.fn(), publishingAccess: vi.fn(),
  createFacebookPost: vi.fn(), createInstagramContainer: vi.fn(), publishInstagramContainer: vi.fn(),
  containerStatus: vi.fn(), readPublishedPost: vi.fn(),
}));
vi.mock('../_shared/loadMetaAccess.ts', () => ({ loadMetaAccess: mocks.loadMetaAccess }));
vi.mock('./image.ts', () => ({ storePostImage: mocks.storePostImage }));
vi.mock('./meta.ts', async original => ({
  ...await original<typeof import('./meta')>(),
  publishingAccess: mocks.publishingAccess, createFacebookPost: mocks.createFacebookPost,
  createInstagramContainer: mocks.createInstagramContainer, publishInstagramContainer: mocks.publishInstagramContainer,
  containerStatus: mocks.containerStatus, readPublishedPost: mocks.readPublishedPost,
}));
vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({
  createClient: () => ({
    auth: { getUser: mocks.getUser }, rpc: mocks.rpc,
    from: (table: string) => ({
      select: () => ({
        eq: (_field: string, value: string) => table === 'products'
          ? { maybeSingle: mocks.readProduct } : { order: () => mocks.readPosts(value) },
        in: (_field: string, values: string[]) => mocks.readMany(values),
      }),
      insert: mocks.insert,
      update: (updates: Record<string, unknown>) => {
        const filters: Record<string, unknown> = {};
        const builder = {
          eq: (field: string, value: unknown) => { filters[field] = value; return builder; },
          select: () => ({ maybeSingle: () => mocks.checkpoint(updates, filters) }),
        };
        return builder;
      },
    }),
  }),
}));

const productId = '00000000-0000-4000-8000-000000000002';
const ids = { facebook: '00000000-0000-4000-8000-000000000003', instagram: '00000000-0000-4000-8000-000000000004' };
const env: Record<string, string> = {
  SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'anon-fixture', SUPABASE_SERVICE_ROLE_KEY: 'service-fixture',
  META_ORGANIC_PUBLISHING_ENABLED: 'true', META_PAGE_ID: '456',
};
const fixture = (platform: SocialPlatform, overrides: Partial<SocialPost> = {}): SocialPost => ({
  id: ids[platform], product_id: productId, platform, status: 'draft',
  request: {
    productName: 'Bag', productUrl: 'https://luviacreations.com/p/bag/', sourceImageUrl: 'https://images.example.test/bag.webp',
    imageUrl: 'https://images.example.test/post.jpg', caption: `Reviewed ${platform} caption`, pageId: '456', pageName: 'Page',
    ...(platform === 'instagram' ? { instagramUserId: '999', instagramUsername: 'luvia' } : {}),
  },
  container_id: null, post_id: null, permalink: null, error: null, attempt_started_at: null, publish_started_at: null,
  revision: 1, updated_at: '2026-01-01T00:00:00Z', ...overrides,
});
let rows: SocialPost[];
let handle: (request: Request) => Promise<Response>;
const request = (body: unknown) => new Request('https://example.test/marketing-post', {
  method: 'POST', headers: { Authorization: 'Bearer fixture', 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const publish = (platforms: SocialPlatform[] = ['facebook']) => request({
  action: 'publish', confirmLive: true, posts: platforms.map(platform => ({ id: ids[platform], revision: 1 })),
});
const prepare = (overrides = {}) => {
  const body = new FormData();
  body.append('input', JSON.stringify({
    action: 'prepare', productId, pageId: '456', sourceImageUrl: 'https://images.example.test/bag.webp',
    captions: { facebook: 'Reviewed new caption' }, ...overrides,
  }));
  body.append('image', new File(['jpeg-fixture'], 'post.jpg', { type: 'image/jpeg' }));
  return new Request('https://example.test/marketing-post', { method: 'POST', headers: { Authorization: 'Bearer fixture' }, body });
};

beforeAll(async () => {
  vi.stubGlobal('Deno', { env: { get: (name: string) => env[name] }, serve: (handler: typeof handle) => { handle = handler; } });
  await import('./index');
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.resetAllMocks();
  rows = [fixture('facebook')];
  env.META_ORGANIC_PUBLISHING_ENABLED = 'true';
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin-fixture' } }, error: null });
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.loadMetaAccess.mockResolvedValue({ config: { accessToken: 'login-token-fixture', accountId: '123', graphApiVersion: 'v27.0' } });
  mocks.readProduct.mockResolvedValue({ data: {
    id: productId, name: 'Bag', image_url: 'https://images.example.test/bag.webp', public_slug: 'bag', published: true,
  }, error: null });
  mocks.readPosts.mockImplementation(async id => ({ data: structuredClone(rows.filter(row => row.product_id === id)), error: null }));
  mocks.readMany.mockImplementation(async values => ({ data: structuredClone(rows.filter(row => values.includes(row.id))), error: null }));
  mocks.checkpoint.mockImplementation(async (updates, filters) => {
    const index = rows.findIndex(row => row.id === filters.id && row.status === filters.status && row.revision === filters.revision);
    if (index < 0) return { data: null, error: null };
    rows[index] = { ...rows[index], ...updates };
    return { data: structuredClone(rows[index]), error: null };
  });
  mocks.insert.mockImplementation(async value => {
    rows.push({ ...fixture(value.platform), ...value });
    return { error: null };
  });
  mocks.storePostImage.mockResolvedValue('https://images.example.test/prepared.jpg');
  mocks.publishingAccess.mockResolvedValue({
    config: { accessToken: 'page-token-fixture', accountId: '123', graphApiVersion: 'v27.0' },
    setup: { enabled: true, pageId: '456', pageName: 'Page', instagram: { id: '999', username: 'luvia' } },
  });
  mocks.createFacebookPost.mockResolvedValue('456_100');
  mocks.createInstagramContainer.mockResolvedValue('300');
  mocks.containerStatus.mockResolvedValue({ status: 'ready', error: null });
  mocks.publishInstagramContainer.mockResolvedValue('400');
  mocks.readPublishedPost.mockImplementation(async post => ({
    status: 'published', error: null, permalink: post.platform === 'facebook'
      ? 'https://www.facebook.com/456/posts/100' : 'https://www.instagram.com/p/abc/',
  }));
});

it('denies anonymous and password-only/non-admin requests before ledger/provider access', async () => {
  expect((await handle(new Request('https://example.test', { method: 'POST' }))).status).toBe(401);
  mocks.rpc.mockResolvedValueOnce({ data: false, error: null });
  expect((await handle(publish())).status).toBe(403);
  expect(mocks.rpc).toHaveBeenCalledWith('is_catalogue_admin');
  expect(mocks.loadMetaAccess).not.toHaveBeenCalled();
  expect(mocks.readMany).not.toHaveBeenCalled();
});

it('requires explicit live consent and rejects injected payloads before writes', async () => {
  for (const body of [
    { action: 'publish', posts: [{ id: ids.facebook, revision: 1 }] },
    { action: 'publish', confirmLive: true, posts: [{ id: ids.facebook, revision: 1 }], caption: 'injected' },
    { action: 'publish', confirmLive: true, posts: [{ id: ids.facebook, revision: 1 }, { id: ids.facebook, revision: 1 }] },
  ]) expect((await handle(request(body))).status).toBe(400);
  expect(mocks.loadMetaAccess).not.toHaveBeenCalled();
  expect(mocks.checkpoint).not.toHaveBeenCalled();
});

it('disables live publishing independently of paid-ad controls', async () => {
  env.META_ORGANIC_PUBLISHING_ENABLED = 'false';
  expect((await handle(publish())).status).toBe(503);
  expect(mocks.publishingAccess).not.toHaveBeenCalled();
  expect(mocks.checkpoint).not.toHaveBeenCalled();
});

it('prepares immutable reviewed previews without any Meta publication or token leakage', async () => {
  const result = await handle(prepare());
  expect(result.status).toBe(200);
  const body = await result.text();
  expect(body).toContain('Reviewed new caption');
  expect(body).toContain('https://images.example.test/prepared.jpg');
  expect(body).not.toContain('token-fixture');
  expect(rows[0]).toMatchObject({ status: 'draft', revision: 2, attempt_started_at: null, request: {
    productUrl: 'https://luviacreations.com/p/bag/', caption: 'Reviewed new caption',
  } });
  expect(mocks.createFacebookPost).not.toHaveBeenCalled();
  expect(mocks.createInstagramContainer).not.toHaveBeenCalled();
});

it('rejects changed source images and changed identities before upload/claim', async () => {
  expect((await handle(prepare({ sourceImageUrl: 'https://images.example.test/old.webp' }))).status).toBe(502);
  expect((await handle(prepare({ pageId: '457' }))).status).toBe(502);
  expect(mocks.storePostImage).not.toHaveBeenCalled();
  expect(mocks.checkpoint).not.toHaveBeenCalled();
});

it('rejects stale reviewed revisions and mixed products without sending a post', async () => {
  rows[0].revision = 2;
  expect((await handle(publish())).status).toBe(502);
  rows = [fixture('facebook'), fixture('instagram', { product_id: '00000000-0000-4000-8000-000000000009' })];
  expect((await handle(publish(['facebook', 'instagram']))).status).toBe(502);
  expect(mocks.publishingAccess).not.toHaveBeenCalled();
  expect(mocks.checkpoint).not.toHaveBeenCalled();
});

it('lets only one competing revision claim publish the Facebook photo', async () => {
  const results = await Promise.all([handle(publish()), handle(publish())]);
  expect(results.map(result => result.status).sort()).toEqual([200, 502]);
  expect(mocks.createFacebookPost).toHaveBeenCalledOnce();
  expect(rows[0]).toMatchObject({ status: 'published', post_id: '456_100' });
  expect(rows[0].publish_started_at).toBeTruthy();
  expect(mocks.checkpoint.mock.invocationCallOrder[0]).toBeLessThan(mocks.createFacebookPost.mock.invocationCallOrder[0]);
});

it('checkpoints the Instagram container and publishing claim before media_publish', async () => {
  rows = [fixture('instagram')];
  expect((await handle(publish(['instagram']))).status).toBe(200);
  expect(rows[0]).toMatchObject({ status: 'published', container_id: '300', post_id: '400' });
  const containerSave = mocks.checkpoint.mock.calls.findIndex(([value]) => value.container_id === '300');
  const publishClaim = mocks.checkpoint.mock.calls.findIndex(([value]) => Boolean(value.publish_started_at));
  expect(mocks.checkpoint.mock.invocationCallOrder[containerSave]).toBeLessThan(mocks.publishInstagramContainer.mock.invocationCallOrder[0]);
  expect(mocks.checkpoint.mock.invocationCallOrder[publishClaim]).toBeLessThan(mocks.publishInstagramContainer.mock.invocationCallOrder[0]);
});

it('leaves processing Instagram containers saved and refreshes GET-only to explicit ready review', async () => {
  rows = [fixture('instagram')];
  mocks.containerStatus.mockResolvedValueOnce({ status: 'processing', error: null });
  expect((await handle(publish(['instagram']))).status).toBe(200);
  expect(rows[0]).toMatchObject({ status: 'processing', container_id: '300', publish_started_at: null });
  expect(mocks.publishInstagramContainer).not.toHaveBeenCalled();
  expect((await handle(request({ action: 'refresh', productId }))).status).toBe(200);
  expect(rows[0].status).toBe('ready');
  expect(mocks.createInstagramContainer).toHaveBeenCalledOnce();
  expect(mocks.publishInstagramContainer).not.toHaveBeenCalled();
  const result = await handle(request({ action: 'publish', confirmLive: true, posts: [{ id: ids.instagram, revision: rows[0].revision }] }));
  expect(result.status).toBe(200);
  expect(mocks.createInstagramContainer).toHaveBeenCalledOnce();
  expect(mocks.publishInstagramContainer).toHaveBeenCalledOnce();
});

it('retains partial outcomes and permanently blocks uncertain writes from duplicate preparation/publication', async () => {
  rows = [fixture('facebook'), fixture('instagram')];
  mocks.createFacebookPost.mockRejectedValueOnce(new Error('Meta connection failed. Inspect the Page before any further action.'));
  expect((await handle(publish(['facebook', 'instagram']))).status).toBe(200);
  expect(rows.map(row => row.status)).toEqual(['needs_attention', 'published']);
  expect((await handle(publish())).status).toBe(502);
  expect((await handle(prepare())).status).toBe(502);
  expect(mocks.createFacebookPost).toHaveBeenCalledOnce();
  expect(mocks.createInstagramContainer).toHaveBeenCalledOnce();
  expect(mocks.storePostImage).not.toHaveBeenCalled();
});

it('does not publish Instagram if its container checkpoint fails', async () => {
  rows = [fixture('instagram')];
  const checkpoint = mocks.checkpoint.getMockImplementation()!;
  mocks.checkpoint.mockImplementation((updates, filters) => updates.container_id
    ? Promise.resolve({ data: null, error: { message: 'fixture save failure' } }) : checkpoint(updates, filters));
  expect((await handle(publish(['instagram']))).status).toBe(200);
  expect(rows[0]).toMatchObject({ status: 'needs_attention', container_id: null });
  expect(mocks.publishInstagramContainer).not.toHaveBeenCalled();
  expect((await handle(publish(['instagram']))).status).toBe(502);
  expect(mocks.createInstagramContainer).toHaveBeenCalledOnce();
});

it('reconciles a saved post ID with GET-only refresh, never an uncertain publish without an ID', async () => {
  rows = [
    fixture('facebook', { status: 'needs_attention', post_id: '456_100', attempt_started_at: '2026-01-01T00:00:00Z', publish_started_at: '2026-01-01T00:00:00Z' }),
    fixture('instagram', { status: 'needs_attention', container_id: '300', attempt_started_at: '2026-01-01T00:00:00Z', publish_started_at: '2026-01-01T00:00:00Z' }),
  ];
  expect((await handle(request({ action: 'refresh', productId }))).status).toBe(200);
  expect(rows.map(row => row.status)).toEqual(['published', 'needs_attention']);
  expect(mocks.containerStatus).not.toHaveBeenCalled();
  expect(mocks.createFacebookPost).not.toHaveBeenCalled();
  expect(mocks.publishInstagramContainer).not.toHaveBeenCalled();
});
