// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { fetchInstagramFeed } from './meta';

const config = { accessToken: 'login-token-fixture', accountId: '123', graphApiVersion: 'v27.0' };
const fetcher = vi.fn<typeof fetch>();
const now = Date.now();
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const grants = ['instagram_basic', 'pages_show_list', 'pages_read_engagement', 'instagram_manage_insights'];
const media = {
  id: '789', media_type: 'VIDEO', media_url: 'https://scontent.cdninstagram.com/video.mp4',
  thumbnail_url: 'https://scontent.cdninstagram.com/preview.jpg', permalink: 'https://www.instagram.com/reel/abc/',
  timestamp: new Date(now - 1000).toISOString(), caption: 'Making a crochet flower', like_count: 24,
};

beforeEach(() => fetcher.mockReset());

it('reads the selected Page and recent media without exposing credentials', async () => {
  fetcher.mockResolvedValueOnce(response({ data: grants.map(permission => ({ permission, status: 'granted' })) }))
    .mockResolvedValueOnce(response({ id: '456', name: 'Luvia', access_token: 'page-token-fixture' }))
    .mockResolvedValueOnce(response({ id: '456', instagram_business_account: { id: '999', username: 'luvia' } }))
    .mockResolvedValueOnce(response({ data: [media] }))
    .mockResolvedValueOnce(response({ data: [{ name: 'views', values: [{ value: 1234 }] }] }));
  const result = await fetchInstagramFeed(config, '456', fetcher, now);
  expect(result).toEqual({
    username: 'luvia',
    posts: [{
      id: '789', permalink: 'https://www.instagram.com/reel/abc/', previewUrl: media.thumbnail_url,
      caption: media.caption, mediaType: 'VIDEO', timestamp: media.timestamp,
      likesCount: 24, viewsCount: 1234, viewsChecked: true,
    }],
  });
  expect(fetcher.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual([
    '/v27.0/me/permissions', '/v27.0/456', '/v27.0/456', '/v27.0/999/media', '/v27.0/789/insights',
  ]);
  expect(fetcher.mock.calls.slice(0, 2).every(([, init]) => init?.headers && new Headers(init.headers).get('Authorization') === 'Bearer login-token-fixture')).toBe(true);
  expect(fetcher.mock.calls.slice(2, 4).every(([, init]) => init?.headers && new Headers(init.headers).get('Authorization') === 'Bearer page-token-fixture')).toBe(true);
  expect(new Headers(fetcher.mock.calls[4][1]?.headers).get('Authorization')).toBe('Bearer login-token-fixture');
  const insightsUrl = new URL(String(fetcher.mock.calls[4][0]));
  expect(insightsUrl.searchParams.get('metric')).toBe('views');
  expect(insightsUrl.searchParams.has('period')).toBe(false);
  expect(JSON.stringify(result)).not.toContain('token-fixture');
});

it('keeps the feed available and omits views when Insights permission is not granted', async () => {
  fetcher.mockResolvedValueOnce(response({ data: grants.filter(permission => permission !== 'instagram_manage_insights')
    .map(permission => ({ permission, status: 'granted' })) }))
    .mockResolvedValueOnce(response({ id: '456', name: 'Luvia', access_token: 'page-token-fixture' }))
    .mockResolvedValueOnce(response({ id: '456', instagram_business_account: { id: '999', username: 'luvia' } }))
    .mockResolvedValueOnce(response({ data: [media] }));
  const result = await fetchInstagramFeed(config, '456', fetcher, now);
  expect(result.posts[0]).toMatchObject({ likesCount: 24, viewsChecked: true });
  expect(result.posts[0].viewsCount).toBeUndefined();
  expect(fetcher).toHaveBeenCalledTimes(4);
});

it('does not request view insights for carousel posts', async () => {
  const album = { ...media, media_type: 'CAROUSEL_ALBUM' };
  fetcher.mockResolvedValueOnce(response({ data: grants.map(permission => ({ permission, status: 'granted' })) }))
    .mockResolvedValueOnce(response({ id: '456', name: 'Luvia', access_token: 'page-token-fixture' }))
    .mockResolvedValueOnce(response({ id: '456', instagram_business_account: { id: '999', username: 'luvia' } }))
    .mockResolvedValueOnce(response({ data: [album] }));
  const result = await fetchInstagramFeed(config, '456', fetcher, now);
  expect(result.posts[0]).toMatchObject({ likesCount: 24, viewsChecked: true });
  expect(result.posts[0].viewsCount).toBeUndefined();
  expect(fetcher).toHaveBeenCalledTimes(4);
});

it('keeps post previews available when an individual Insights request fails', async () => {
  fetcher.mockResolvedValueOnce(response({ data: grants.map(permission => ({ permission, status: 'granted' })) }))
    .mockResolvedValueOnce(response({ id: '456', name: 'Luvia', access_token: 'page-token-fixture' }))
    .mockResolvedValueOnce(response({ id: '456', instagram_business_account: { id: '999', username: 'luvia' } }))
    .mockResolvedValueOnce(response({ data: [media] }))
    .mockResolvedValueOnce(response({ error: { code: 10, message: 'Insights unavailable' } }, 400));
  const result = await fetchInstagramFeed(config, '456', fetcher, now);
  expect(result.posts[0]).toMatchObject({ likesCount: 24, viewsChecked: true });
  expect(result.posts[0].viewsCount).toBeUndefined();
});

it('stops before Page or media requests when instagram_basic was not granted', async () => {
  fetcher.mockResolvedValueOnce(response({ data: grants.filter(permission => permission !== 'instagram_basic')
    .map(permission => ({ permission, status: 'granted' })) }));
  await expect(fetchInstagramFeed(config, '456', fetcher, now)).rejects.toThrow('instagram_basic');
  expect(fetcher).toHaveBeenCalledOnce();
});

it('rejects unconfigured Pages before calling Meta', async () => {
  await expect(fetchInstagramFeed(config, 'invalid', fetcher, now)).rejects.toThrow('Page is not configured');
  expect(fetcher).not.toHaveBeenCalled();
});
