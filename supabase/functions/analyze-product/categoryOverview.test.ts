import { afterEach, expect, it, vi } from 'vitest';
import { callCloudflareOverview } from './categoryOverview';

afterEach(() => vi.unstubAllGlobals());

it.each([
  { success: true, result: { response: 'not json' } },
  { success: true, result: { response: '[]' } },
  { success: true, result: {} },
])('rejects malformed Cloudflare responses', async payload => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(payload))));
  expect(await callCloudflareOverview('account', 'token', 'Public product facts')).toHaveProperty('error');
});

it('surfaces request timeouts without returning a successful draft', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('Timed out', 'TimeoutError')));
  expect(await callCloudflareOverview('account', 'token', 'Public product facts'))
    .toEqual({ error: 'Cloudflare overview generation timed out. Please try again later.' });
});
