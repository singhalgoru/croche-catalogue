import { afterEach, expect, it, vi } from 'vitest';
import { callCloudflareOverview } from './categoryOverview';

afterEach(() => vi.unstubAllGlobals());

it.each([
  { success: true, result: { response: 'not json' } },
  { success: true, result: { response: '[]' } },
  { success: true, result: {} },
  { success: true, result: { response: {} } },
  { success: true, result: { response: { overview: 123 } } },
])('rejects malformed Cloudflare responses', async payload => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(payload))));
  expect(await callCloudflareOverview('account', 'token', 'Public product facts')).toHaveProperty('error');
});

it.each([
  { overview: 'A collection of handmade crochet.' },
  JSON.stringify({ overview: 'A collection of handmade crochet.' }),
])('accepts structured JSON-mode and string response formats', async result => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, result: { response: result } })));
  vi.stubGlobal('fetch', fetch);
  expect(await callCloudflareOverview('account', 'token', 'Public product facts'))
    .toEqual({ data: { overview: 'A collection of handmade crochet.' } });
  expect(JSON.parse(fetch.mock.calls[0][1].body).response_format).toEqual({
    type: 'json_schema',
    json_schema: {
      type: 'object',
      properties: { overview: { type: 'string' } },
      required: ['overview'],
    },
  });
});
it('surfaces request timeouts without returning a successful draft', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('Timed out', 'TimeoutError')));
  expect(await callCloudflareOverview('account', 'token', 'Public product facts'))
    .toEqual({ error: 'Cloudflare overview generation timed out. Please try again later.' });
});
