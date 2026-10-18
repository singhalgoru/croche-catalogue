// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
const { storageFetch } = vi.hoisted(() => ({ storageFetch: vi.fn() }));
vi.mock('aws4fetch', () => ({ AwsClient: class { fetch = storageFetch; } }));
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
it('runs the actual encoder through isolated private storage round trips and cleans all exact objects', async () => {
  for (const [key, value] of Object.entries({ R2_ACCOUNT_ID: 'fixture', R2_ACCESS_KEY_ID: 'fixture',
    R2_SECRET_ACCESS_KEY: 'fixture', R2_ORIGINALS_BUCKET: 'private', R2_BUCKET: 'public' })) vi.stubEnv(key, value);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  const objects = new Map<string, Buffer>();
  storageFetch.mockImplementation(async (url: string, options: { method?: string; body?: Buffer }) => {
    expect(url).toMatch(/\/private\/making-video-smoke\/[0-9a-f-]{36}\/(original\.mp4|video\.mp4|poster\.webp)$/);
    if (options.method === 'PUT') { objects.set(url, options.body!); return new Response(''); }
    if (options.method === 'DELETE') { objects.delete(url); return new Response(null, { status: 204 }); }
    if (options.method === 'HEAD') return new Response(null, { status: objects.has(url) ? 200 : 404 });
    return new Response(objects.get(url)!);
  });
  await import('./verify-video-processor.mjs');
  expect(objects.size).toBe(0);
  expect(storageFetch.mock.calls.filter(call => call[1]?.method === 'PUT')).toHaveLength(3);
  expect(storageFetch.mock.calls.filter(call => call[1]?.method === 'DELETE')).toHaveLength(3);
}, 120_000);
