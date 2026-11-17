// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { containerStatus, createFacebookPost, createInstagramContainer, instagramChildrenStatus, publishInstagramContainer, publishingAccess, readPublishedPost } from './meta';
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

it('verifies a directly obtained Page token and MANAGE-only read access when the Page list is empty', async () => {
  fetcher.mockResolvedValueOnce(permissions()).mockResolvedValueOnce(response({ data: [] }))
    .mockResolvedValueOnce(response({ id: '456', name: 'Page', access_token: 'page-token-fixture' }))
    .mockResolvedValueOnce(response({ id: '456' }))
    .mockResolvedValueOnce(response({ data: [{ setting: 'fixture', value: true }] }))
    .mockResolvedValueOnce(response({ id: '456', instagram_business_account: { id: '999', username: 'luvia' } }));
  const access = await publishingAccess(config, '456', ['instagram'], false, fetcher);
  expect(access.setup).toMatchObject({ pageId: '456', instagram: { id: '999' } });
  expect(JSON.stringify(access.setup)).not.toContain('page-token-fixture');
  expect(fetcher.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual([
    '/v27.0/me/permissions', '/v27.0/me/accounts', '/v27.0/456', '/v27.0/me', '/v27.0/456/settings', '/v27.0/456',
  ]);
  expect(fetcher.mock.calls.slice(3).every(([, options]) =>
    options?.method === 'GET' && JSON.stringify(options.headers) === JSON.stringify({ Authorization: 'Bearer page-token-fixture' }))).toBe(true);
});

it.each([
  [{ id: '457', name: 'Page', access_token: 'page-token-fixture' }, { id: '456' }, { data: [] }, 'did not return the configured'],
  [{ id: '456', name: 'Page' }, { id: '456' }, { data: [] }, 'did not provide its Page access token'],
  [{ id: '456', name: 'Page', access_token: 'page-token-fixture' }, { id: '457' }, { data: [] }, 'did not identify the configured'],
  [{ id: '456', name: 'Page', access_token: 'page-token-fixture' }, { id: '456' }, { data: 'invalid' }, 'did not verify Page management access'],
])('fails closed when the direct Page token or management check is invalid', async (pageResult, identity, settings, diagnostic) => {
  fetcher.mockResolvedValueOnce(permissions()).mockResolvedValueOnce(response({ data: [] }))
    .mockResolvedValueOnce(response(pageResult)).mockResolvedValueOnce(response(identity)).mockResolvedValueOnce(response(settings));
  const failure = await publishingAccess(config, '456', ['instagram'], false, fetcher).catch(error => error);
  expect(failure.message).toContain(diagnostic);
  expect(failure.message).not.toContain('page-token-fixture');
  expect(fetcher.mock.calls.every(([, options]) => options?.method === 'GET')).toBe(true);
});

it('fails closed when Meta denies the direct Page management check', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  fetcher.mockResolvedValueOnce(permissions()).mockResolvedValueOnce(response({ data: [] }))
    .mockResolvedValueOnce(response({ id: '456', name: 'Page', access_token: 'page-token-fixture' }))
    .mockResolvedValueOnce(response({ id: '456' }))
    .mockResolvedValueOnce(response({ error: { code: 200, message: 'secret provider message' } }, 403));
  await expect(publishingAccess(config, '456', ['instagram'], false, fetcher)).rejects.toThrow('HTTP 403, code 200');
  expect(fetcher).toHaveBeenCalledTimes(5);
  log.mockRestore();
});

it.each([
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

it('creates an Instagram Reel and publishes a Facebook video through Meta resumable upload', async () => {
  const pageConfig = { ...config, accessToken: page.access_token };
  const videoPost = (platform: SocialPost['platform']): SocialPost => ({
    ...post(platform),
    request: { ...post(platform).request, mediaType: 'video', videoUrl: 'https://videos.example.test/making-videos/job/video.mp4' },
  });
  fetcher.mockResolvedValueOnce(response({ id: '300' }))
    .mockResolvedValueOnce(new Response(null, { status: 200, headers: { 'Content-Type': 'video/mp4', 'Content-Length': '12' } }))
    .mockResolvedValueOnce(response({ id: 'upload:session-1' }))
    .mockResolvedValueOnce(new Response(new Uint8Array(12), { status: 200, headers: { 'Content-Type': 'video/mp4', 'Content-Length': '12' } }))
    .mockResolvedValueOnce(response({ h: 'uploaded-file-handle' }))
    .mockResolvedValueOnce(response({ id: '500' }));
  await expect(createInstagramContainer(videoPost('instagram'), pageConfig, fetcher)).resolves.toBe('300');
  await expect(createFacebookPost(videoPost('facebook'), pageConfig, fetcher, undefined, {
    appId: '123', userAccessToken: config.accessToken, graphApiVersion: config.graphApiVersion,
  })).resolves.toBe('500');
  expect(fetcher.mock.calls.slice(0, 1).map(([url, options]) => ({
    path: new URL(String(url)).pathname, body: Object.fromEntries(new URLSearchParams(String(options?.body))),
  }))).toEqual([
    { path: '/v27.0/999/media', body: {
      media_type: 'REELS', video_url: 'https://videos.example.test/making-videos/job/video.mp4',
      cover_url: 'https://images.example.test/post.jpg', caption: 'Handmade bag', share_to_feed: 'true',
    } },
  ]);
  const calls = fetcher.mock.calls.slice(1);
  expect(String(calls[0][0])).toBe('https://videos.example.test/making-videos/job/video.mp4');
  expect(calls[0][1]?.method).toBe('HEAD');
  expect(new URL(String(calls[1][0])).pathname).toBe('/v27.0/123/uploads');
  expect(new URL(String(calls[1][0])).searchParams).toEqual(new URLSearchParams({
    file_name: 'product-making-video.mp4', file_length: '12', file_type: 'video/mp4',
  }));
  expect(calls[2][1]?.method).toBe('GET');
  expect(new URL(String(calls[3][0])).pathname).toBe('/v27.0/upload:session-1');
  expect(calls[3][1]?.headers).toMatchObject({ Authorization: `OAuth ${config.accessToken}`, file_offset: '0' });
  expect(calls[4][1]?.body).toEqual(new URLSearchParams({
    title: 'Bag', description: 'Handmade bag', fbuploader_video_file_chunk: 'uploaded-file-handle',
  }));
  expect(new URL(String(calls[4][0])).hostname).toBe('graph-video.facebook.com');
});

it('checks video processing before confirming each platform publication', async () => {
  const facebookVideo: SocialPost = { ...post('facebook'), request: {
    ...post('facebook').request, mediaType: 'video', videoUrl: 'https://videos.example.test/making-videos/job/video.mp4',
  }, post_id: '500' };
  fetcher.mockResolvedValueOnce(response({ id: '500', published: false, status: { video_status: 'processing' } }));
  await expect(readPublishedPost(facebookVideo, config, fetcher)).resolves.toEqual({ status: 'processing', error: null });
  fetcher.mockResolvedValueOnce(response({
    id: '500', published: true, status: { video_status: 'ready' },
    from: { id: '456' }, permalink_url: 'https://www.facebook.com/456/videos/500',
  }));
  await expect(readPublishedPost(facebookVideo, config, fetcher)).resolves.toMatchObject({ status: 'published' });
  const instagramVideo: SocialPost = { ...post('instagram'), request: {
    ...post('instagram').request, mediaType: 'video', videoUrl: 'https://videos.example.test/making-videos/job/video.mp4',
  }, post_id: '600' };
  fetcher.mockResolvedValueOnce(response({
    id: '600', media_type: 'VIDEO', media_product_type: 'REELS', permalink: 'https://www.instagram.com/p/abc/',
  }));
  await expect(readPublishedPost(instagramVideo, config, fetcher)).resolves.toMatchObject({ status: 'published' });
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

const carousel = (platform: SocialPost['platform']) => {
  const value = post(platform);
  value.container_id = null;
  value.request.sourceImageUrls = [value.request.sourceImageUrl, 'https://images.example.test/second.webp'];
  value.request.imageUrls = [value.request.imageUrl, 'https://images.example.test/second.jpg'];
  return value;
};
const calls = () => fetcher.mock.calls.map(([url, options]) => ({
  path: new URL(String(url)).pathname, method: options?.method,
  body: Object.fromEntries(new URLSearchParams(String(options?.body))),
}));

const mixedPost = (): SocialPost => ({
  ...post('instagram'), container_id: null,
  request: {
    ...post('instagram').request, mediaType: 'mixed',
    sourceImageUrls: [post('instagram').request.sourceImageUrl], imageUrls: [post('instagram').request.imageUrl],
    videoUrl: 'https://videos.example.test/video.mp4', videoPosterUrl: 'https://images.example.test/poster.webp',
  },
});

it('checkpoints ordered photo and VIDEO children and waits without creating a parent while video processes', async () => {
  fetcher.mockResolvedValueOnce(response({ id: '101' })).mockResolvedValueOnce(response({ id: '102' }))
    .mockResolvedValueOnce(response({ id: '101', status_code: 'FINISHED' }))
    .mockResolvedValueOnce(response({ id: '102', status_code: 'IN_PROGRESS' }));
  const save = vi.fn(async () => {});
  await expect(createInstagramContainer(mixedPost(), config, fetcher, save)).resolves.toBeNull();
  expect(calls().slice(0, 2)).toEqual([
    { path: '/v27.0/999/media', method: 'POST', body: { image_url: post('instagram').request.imageUrl, is_carousel_item: 'true' } },
    { path: '/v27.0/999/media', method: 'POST', body: { media_type: 'VIDEO', video_url: 'https://videos.example.test/video.mp4', is_carousel_item: 'true' } },
  ]);
  expect(save.mock.calls).toEqual([[['101']], [['101', '102']]]);
  expect(save.mock.invocationCallOrder[1]).toBeLessThan(fetcher.mock.invocationCallOrder[2]);
  expect(fetcher).toHaveBeenCalledTimes(4);
});

it('checks existing mixed children read-only and creates exactly one ordered parent without re-uploading', async () => {
  const value = mixedPost();
  value.request.childMediaIds = ['101', '102'];
  fetcher.mockResolvedValueOnce(response({ id: '101', status_code: 'FINISHED' }))
    .mockResolvedValueOnce(response({ id: '102', status_code: 'FINISHED' }));
  await expect(instagramChildrenStatus(value, config, fetcher)).resolves.toEqual({ status: 'ready', error: null });
  expect(fetcher.mock.calls.every(([, options]) => options?.method === 'GET')).toBe(true);
  fetcher.mockReset().mockResolvedValueOnce(response({ id: '101', status_code: 'FINISHED' }))
    .mockResolvedValueOnce(response({ id: '102', status_code: 'FINISHED' }))
    .mockResolvedValueOnce(response({ id: '300' }));
  await expect(createInstagramContainer(value, config, fetcher)).resolves.toBe('300');
  expect(calls().filter(call => call.method === 'POST')).toEqual([{
    path: '/v27.0/999/media', method: 'POST',
    body: { media_type: 'CAROUSEL', children: '101,102', caption: 'Handmade bag' },
  }]);
  fetcher.mockReset().mockResolvedValueOnce(response({ id: '400', media_type: 'CAROUSEL_ALBUM', permalink: 'https://www.instagram.com/p/mixed/' }));
  await expect(readPublishedPost({ ...value, post_id: '400' }, config, fetcher)).resolves.toMatchObject({ status: 'published' });
});

it('does not resume incomplete, failed or mismatched mixed children or send mixed posts to Facebook', async () => {
  const value = mixedPost();
  value.request.childMediaIds = ['101'];
  await expect(createInstagramContainer(value, config, fetcher)).rejects.toThrow('incomplete');
  expect(fetcher).not.toHaveBeenCalled();
  value.request.childMediaIds = ['101', '102'];
  fetcher.mockResolvedValueOnce(response({ id: '101', status_code: 'ERROR' }));
  await expect(createInstagramContainer(value, config, fetcher)).rejects.toThrow('failed');
  expect(fetcher).toHaveBeenCalledOnce();
  fetcher.mockReset();
  await expect(createFacebookPost({ ...value, platform: 'facebook' }, config, fetcher)).rejects.toThrow('Instagram only');
  expect(fetcher).not.toHaveBeenCalled();
});

it('creates ordered Instagram children and checkpoints each before creating the carousel parent', async () => {
  fetcher.mockResolvedValueOnce(response({ id: '101' })).mockResolvedValueOnce(response({ id: '102' }))
    .mockResolvedValueOnce(response({ id: '300' }));
  const checkpoint = vi.fn(async () => {});
  await expect(createInstagramContainer(carousel('instagram'), config, fetcher, checkpoint)).resolves.toBe('300');
  expect(calls()).toEqual([
    { path: '/v27.0/999/media', method: 'POST', body: { image_url: 'https://images.example.test/post.jpg', is_carousel_item: 'true' } },
    { path: '/v27.0/999/media', method: 'POST', body: { image_url: 'https://images.example.test/second.jpg', is_carousel_item: 'true' } },
    { path: '/v27.0/999/media', method: 'POST', body: { media_type: 'CAROUSEL', children: '101,102', caption: 'Handmade bag' } },
  ]);
  expect(checkpoint.mock.calls).toEqual([[['101']], [['101', '102']]]);
  expect(checkpoint.mock.invocationCallOrder[0]).toBeLessThan(fetcher.mock.invocationCallOrder[1]);
  expect(checkpoint.mock.invocationCallOrder[1]).toBeLessThan(fetcher.mock.invocationCallOrder[2]);
});

it('uploads unpublished Facebook photos and attaches their ordered IDs to a single feed post', async () => {
  fetcher.mockResolvedValueOnce(response({ id: '101' })).mockResolvedValueOnce(response({ id: '102' }))
    .mockResolvedValueOnce(response({ id: '456_100' }));
  const checkpoint = vi.fn(async () => {});
  await expect(createFacebookPost(carousel('facebook'), config, fetcher, checkpoint)).resolves.toBe('456_100');
  expect(calls()).toEqual([
    { path: '/v27.0/456/photos', method: 'POST', body: { url: 'https://images.example.test/post.jpg', published: 'false' } },
    { path: '/v27.0/456/photos', method: 'POST', body: { url: 'https://images.example.test/second.jpg', published: 'false' } },
    { path: '/v27.0/456/feed', method: 'POST', body: { message: 'Handmade bag',
      attached_media: '[{"media_fbid":"101"},{"media_fbid":"102"}]' } },
  ]);
  expect(checkpoint.mock.calls).toEqual([[['101']], [['101', '102']]]);
  expect(checkpoint.mock.invocationCallOrder[1]).toBeLessThan(fetcher.mock.invocationCallOrder[2]);
});

it.each(['facebook', 'instagram'] as const)('does not continue or retry after a partial %s upload or checkpoint failure', async platform => {
  const create = platform === 'facebook' ? createFacebookPost : createInstagramContainer;
  const checkpoint = vi.fn(async () => {});
  fetcher.mockResolvedValueOnce(response({ id: '101' })).mockRejectedValueOnce(new Error('uncertain network'));
  await expect(create(carousel(platform), config, fetcher, checkpoint)).rejects.toThrow('Publishing may have completed');
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(checkpoint.mock.calls).toEqual([[['101']]]);

  fetcher.mockReset().mockResolvedValueOnce(response({ id: '101' }));
  checkpoint.mockRejectedValueOnce(new Error('checkpoint unavailable'));
  await expect(create(carousel(platform), config, fetcher, checkpoint)).rejects.toThrow('checkpoint unavailable');
  expect(fetcher).toHaveBeenCalledOnce();
});

it.each(['facebook', 'instagram'] as const)('requires durable child checkpoints and refuses to recreate existing %s children', async platform => {
  const create = platform === 'facebook' ? createFacebookPost : createInstagramContainer;
  await expect(create(carousel(platform), config, fetcher)).rejects.toThrow('must be checkpointed');
  const value = carousel(platform);
  value.request.childMediaIds = ['101'];
  await expect(create(value, config, fetcher, async () => {})).rejects.toThrow('do not retry');
  expect(fetcher).not.toHaveBeenCalled();
});

it.each(['facebook', 'instagram'] as const)('retains all %s child checkpoints when the final parent write is uncertain', async platform => {
  const create = platform === 'facebook' ? createFacebookPost : createInstagramContainer;
  const checkpoint = vi.fn(async () => {});
  fetcher.mockResolvedValueOnce(response({ id: '101' })).mockResolvedValueOnce(response({ id: '102' }))
    .mockRejectedValueOnce(new Error('uncertain parent write'));
  await expect(create(carousel(platform), config, fetcher, checkpoint)).rejects.toThrow('Publishing may have completed');
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(checkpoint.mock.calls).toEqual([[['101']], [['101', '102']]]);
});

it.each(['facebook', 'instagram'] as const)('stops after malformed or duplicate %s child IDs without publishing a parent', async platform => {
  const create = platform === 'facebook' ? createFacebookPost : createInstagramContainer;
  for (const second of [{}, { id: 'not-numeric' }, { id: '101' }]) {
    fetcher.mockReset().mockResolvedValueOnce(response({ id: '101' })).mockResolvedValueOnce(response(second));
    const checkpoint = vi.fn(async () => {});
    await expect(create(carousel(platform), config, fetcher, checkpoint)).rejects.toThrow('unique child media ID');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(checkpoint.mock.calls).toEqual([[['101']]]);
  }
});

it('verifies Instagram carousel publication as CAROUSEL_ALBUM, not IMAGE, while preserving singleton verification', async () => {
  const value = { ...carousel('instagram'), post_id: '400' };
  fetcher.mockResolvedValueOnce(response({ id: '400', media_type: 'IMAGE', permalink: 'https://www.instagram.com/p/abc/' }))
    .mockResolvedValueOnce(response({ id: '400', media_type: 'CAROUSEL_ALBUM', permalink: 'https://www.instagram.com/p/abc/' }))
    .mockResolvedValueOnce(response({ id: '400', media_type: 'IMAGE', permalink: 'https://www.instagram.com/p/abc/' }));
  await expect(readPublishedPost(value, config, fetcher)).rejects.toThrow('did not verify');
  await expect(readPublishedPost(value, config, fetcher)).resolves.toMatchObject({ status: 'published' });
  await expect(readPublishedPost({ ...post('instagram'), post_id: '400' }, config, fetcher)).resolves.toMatchObject({ status: 'published' });
});
