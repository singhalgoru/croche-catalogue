// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { containerStatus, createFacebookPost, createInstagramContainer, publishInstagramContainer, publishingAccess, readPublishedPost } from './meta';
import type { SocialPost } from '../_shared/socialPosts';

const config = { accessToken: 'login-token-fixture', accountId: '123', graphApiVersion: 'v27.0' };
const fetcher = vi.fn<typeof fetch>();
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const grants = ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'instagram_basic', 'instagram_content_publish'];
const post = (platform: SocialPost['platform']): SocialPost => ({
  id: '00000000-0000-4000-8000-000000000001', product_id: '00000000-0000-4000-8000-000000000002',
  platform, status: 'publishing', request: {
    productName: 'Bag', productUrl: 'https://luviacreations.com/p/bag/', sourceImageUrl: 'https://images.example.test/bag.webp',
    imageUrl: 'https://images.example.test/post.jpg', caption: 'Handmade bag', pageId: '456', pageName: 'Page',
    ...(platform === 'instagram' ? { instagramUserId: '999', instagramUsername: 'luvia' } : {}),
  },
  revision: 1, container_id: '300', post_id: null, permalink: null, error: null,
  attempt_started_at: '2026-01-01T00:00:00Z', publish_started_at: null, updated_at: '2026-01-01T00:00:00Z',
});
const permissions = (values = grants) => response({ data: values.map(permission => ({ permission, status: 'granted' })) });
const page = { id: '456', name: 'Page', access_token: 'page-token-fixture', tasks: ['CREATE_CONTENT'] };

beforeEach(() => { fetcher.mockReset(); });

it('checks publishing permissions first, derives a Page token and never checks ad account billing', async () => {
  fetcher.mockResolvedValueOnce(permissions()).mockResolvedValueOnce(response({ data: [page] }))
    .mockResolvedValueOnce(response({ id: '456', instagram_business_account: { id: '999', username: 'luvia' } }));
  const access = await publishingAccess(config, '456', ['facebook', 'instagram'], true, fetcher);
  expect(access.setup).toEqual({ enabled: true, pageId: '456', pageName: 'Page', instagram: { id: '999', username: 'luvia' } });
  expect(JSON.stringify(access.setup)).not.toContain('token-fixture');
  expect(fetcher.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual([
    '/v27.0/me/permissions', '/v27.0/me/accounts', '/v27.0/456',
  ]);
  expect(fetcher.mock.calls[2][1]?.headers).toEqual({ Authorization: 'Bearer page-token-fixture' });
});

it('rejects missing publishing grants before Page lookup or any write', async () => {
  fetcher.mockResolvedValueOnce(permissions(grants.filter(value => value !== 'instagram_content_publish')));
  await expect(publishingAccess(config, '456', ['instagram'], false, fetcher)).rejects.toThrow('instagram_content_publish');
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it.each(['CREATE_CONTENT', 'MANAGE', 'PROFILE_PLUS_CREATE_CONTENT', 'PROFILE_PLUS_FULL_CONTROL'])(
  'recognizes documented publishing task %s for Facebook and Instagram-only access',
  async task => {
    for (const platform of ['facebook', 'instagram'] as const) {
      fetcher.mockReset().mockResolvedValueOnce(permissions()).mockResolvedValueOnce(response({ data: [{ ...page, tasks: [task] }] }));
      if (platform === 'instagram') fetcher.mockResolvedValueOnce(response({
        id: '456', instagram_business_account: { id: '999', username: 'luvia' },
      }));
      await expect(publishingAccess(config, '456', [platform], false, fetcher)).resolves.toMatchObject({
        setup: { enabled: false, pageId: '456' },
      });
      expect(fetcher.mock.calls.every(([, options]) => options?.method === 'GET')).toBe(true);
    }
  },
);

it('requires a complete unique Page listing and content creation task', async () => {
  fetcher.mockResolvedValueOnce(permissions())
    .mockResolvedValueOnce(response({ data: [page], paging: { next: 'untrusted-next', cursors: { after: 'cursor' } } }))
    .mockResolvedValueOnce(response({ data: [page] }));
  await expect(publishingAccess(config, '456', ['facebook'], true, fetcher)).rejects.toThrow('more than once');
  expect(new URL(String(fetcher.mock.calls[2][0])).searchParams.get('after')).toBe('cursor');
  expect(new URL(String(fetcher.mock.calls[2][0])).hostname).toBe('graph.facebook.com');
  fetcher.mockReset().mockResolvedValueOnce(permissions()).mockResolvedValueOnce(response({ data: [{ ...page, tasks: ['ADVERTISE'] }] }));
  await expect(publishingAccess(config, '456', ['facebook'], true, fetcher)).rejects.toThrow('content-creation access');
});

it.each([
  [[], 'did not return the configured Facebook Page'],
  [[{ ...page, name: '' }], 'without a valid Page name'],
  [[{ ...page, access_token: undefined }], 'did not provide its Page access token'],
  [[{ ...page, tasks: undefined }], 'without a Page task list'],
  [[{ ...page, tasks: [] }], 'Recognized tasks: none; unrecognized task entries: 0'],
  [[{ ...page, tasks: ['PROFILE_PLUS_ADVERTISE', 'PROFILE_PLUS_MODERATE'] }], 'Recognized tasks: PROFILE_PLUS_ADVERTISE, PROFILE_PLUS_MODERATE; unrecognized task entries: 0'],
  [[{ ...page, tasks: ['ADVERTISE', 'UNRECOGNIZED_FIXTURE_WITH_SECRET'] }], 'Recognized tasks: ADVERTISE; unrecognized task entries: 1'],
])('distinguishes Page lookup failures without leaking tokens or arbitrary provider values (%j)', async (data, diagnostic) => {
  fetcher.mockResolvedValueOnce(permissions()).mockResolvedValueOnce(response({ data }));
  const failure = await publishingAccess(config, '456', ['facebook'], false, fetcher).catch(error => error);
  expect(failure).toBeInstanceOf(Error);
  expect(failure.message).toContain(diagnostic);
  expect(failure.message).not.toMatch(/page-token-fixture|UNRECOGNIZED_FIXTURE_WITH_SECRET/);
  expect(fetcher.mock.calls.every(([, options]) => options?.method === 'GET')).toBe(true);
});

it('uses only photo/container/publish endpoints with exact reviewed content and Page token', async () => {
  const pageConfig = { ...config, accessToken: page.access_token };
  fetcher.mockResolvedValueOnce(response({ id: '20', post_id: '456_100' }))
    .mockResolvedValueOnce(response({ id: '300' })).mockResolvedValueOnce(response({ id: '400' }));
  await expect(createFacebookPost(post('facebook'), pageConfig, fetcher)).resolves.toBe('456_100');
  await expect(createInstagramContainer(post('instagram'), pageConfig, fetcher)).resolves.toBe('300');
  await expect(publishInstagramContainer(post('instagram'), pageConfig, fetcher)).resolves.toBe('400');
  expect(fetcher.mock.calls.map(([url, options]) => ({
    path: new URL(String(url)).pathname, method: options?.method,
    body: Object.fromEntries(new URLSearchParams(String(options?.body))),
    authorization: options?.headers,
  }))).toEqual([
    { path: '/v27.0/456/photos', method: 'POST', body: { url: 'https://images.example.test/post.jpg', caption: 'Handmade bag', published: 'true' }, authorization: { Authorization: 'Bearer page-token-fixture' } },
    { path: '/v27.0/999/media', method: 'POST', body: { image_url: 'https://images.example.test/post.jpg', caption: 'Handmade bag' }, authorization: { Authorization: 'Bearer page-token-fixture' } },
    { path: '/v27.0/999/media_publish', method: 'POST', body: { creation_id: '300' }, authorization: { Authorization: 'Bearer page-token-fixture' } },
  ]);
});

it.each([
  ['IN_PROGRESS', 'processing'], ['FINISHED', 'ready'], ['PUBLISHED', 'needs_attention'],
  ['ERROR', 'needs_attention'], ['EXPIRED', 'needs_attention'],
])('reads %s without creating or publishing another container', async (status, expected) => {
  fetcher.mockResolvedValueOnce(response({ id: '300', status_code: status }));
  await expect(containerStatus(post('instagram'), config, fetcher)).resolves.toMatchObject({ status: expected });
  expect(fetcher).toHaveBeenCalledOnce();
  expect(fetcher.mock.calls[0][1]?.method).toBe('GET');
});

it('verifies actual publication identity/type and rejects unsafe permalinks', async () => {
  fetcher.mockResolvedValueOnce(response({ id: '456_100', is_published: false, from: { id: '456' }, permalink_url: 'https://www.facebook.com/456/posts/100' }));
  await expect(readPublishedPost({ ...post('facebook'), post_id: '456_100' }, config, fetcher)).rejects.toThrow('did not verify');
  fetcher.mockResolvedValueOnce(response({ id: '400', media_type: 'IMAGE', permalink: 'https://www.instagram.com.evil.test/p/abc/' }));
  await expect(readPublishedPost({ ...post('instagram'), post_id: '400' }, config, fetcher)).rejects.toThrow('did not verify');
});

it('sanitizes organic HTTP errors without importing paid-ad billing advice', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  fetcher.mockResolvedValueOnce(response({ error: {
    code: 100, error_subcode: 1359188, message: 'secret provider message pages_manage_posts page-token-fixture',
  } }, 400));
  const error = await createFacebookPost(post('facebook'), config, fetcher).catch(value => value);
  expect(error.message).toContain('code 100, subcode 1359188');
  expect(error.message).toContain('pages_manage_posts');
  expect(error.message).not.toMatch(/Billing|page-token-fixture|secret provider message/);
  log.mockRestore();
});
