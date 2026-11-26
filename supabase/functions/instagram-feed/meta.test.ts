// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { fetchInstagramFeed } from './meta';

const config = { accessToken: 'login-token-fixture', accountId: '123', graphApiVersion: 'v27.0' };
const fetcher = vi.fn<typeof fetch>();
const now = Date.now();
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const grants = ['instagram_basic', 'pages_show_list', 'pages_read_engagement'];
const media = {
  id: '789', media_type: 'VIDEO', media_url: 'https://scontent.cdninstagram.com/video.mp4',
  thumbnail_url: 'https://scontent.cdninstagram.com/preview.jpg', permalink: 'https://www.instagram.com/reel/abc/',
  timestamp: new Date(now - 1000).toISOString(), caption: 'Making a crochet flower',
};

beforeEach(() => fetcher.mockReset());

it('reads the selected Page and recent media without exposing credentials', async () => {
  fetcher.mockResolvedValueOnce(response({ data: grants.map(permission => ({ permission, status: 'granted' })) }))
    .mockResolvedValueOnce(response({ id: '456', name: 'Luvia', access_token: 'page-token-fixture' }))
    .mockResolvedValueOnce(response({ id: '456', instagram_business_account: { id: '999', username: 'luvia' } }))
    .mockResolvedValueOnce(response({ data: [media] }));
  const result = await fetchInstagramFeed(config, '456', fetcher, now);
  expect(result).toEqual({
    username: 'luvia',
    posts: [{
      id: '789', permalink: 'https://www.instagram.com/reel/abc/', previewUrl: media.thumbnail_url,
      caption: media.caption, mediaType: 'VIDEO', timestamp: media.timestamp,
    }],
  });
  expect(fetcher.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual([
    '/v27.0/me/permissions', '/v27.0/456', '/v27.0/456', '/v27.0/999/media',
  ]);
  expect(fetcher.mock.calls.slice(0, 2).every(([, init]) => init?.headers && new Headers(init.headers).get('Authorization') === 'Bearer login-token-fixture')).toBe(true);
  expect(fetcher.mock.calls.slice(2).every(([, init]) => init?.headers && new Headers(init.headers).get('Authorization') === 'Bearer page-token-fixture')).toBe(true);
  expect(JSON.stringify(result)).not.toContain('token-fixture');
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
