// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({ createClient: () => ({ rpc }) }));
let handle: (request: Request) => Promise<Response>;
beforeAll(async () => {
  vi.stubGlobal('Deno', { env: { get: () => 'fixture' }, serve: (handler: typeof handle) => { handle = handler; } });
  await import('./index');
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => vi.clearAllMocks());
const request = (id = '00000000-0000-4000-8000-000000000001') => new Request(`https://example.test/image?id=${id}`);
it('only requests publicly accessible photos and never caches withdrawn content', async () => {
  rpc.mockResolvedValue({ data: btoa('fixture-image'), error: null });
  const response = await handle(request());
  expect(rpc).toHaveBeenCalledWith('customer_love_photo', { testimonial_id: '00000000-0000-4000-8000-000000000001', admin_view: false });
  expect(response.headers.get('Content-Type')).toBe('image/webp');
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(await response.text()).toBe('fixture-image');
});
it('returns 404 for private, missing or withdrawn photos', async () => {
  rpc.mockResolvedValue({ data: null, error: null });
  expect((await handle(request())).status).toBe(404);
});
it('rejects malformed references before querying and reports backend failures', async () => {
  expect((await handle(request('not-an-id'))).status).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  rpc.mockResolvedValue({ data: null, error: { message: 'Offline' } });
  expect((await handle(request())).status).toBe(503);
  expect(log).toHaveBeenCalled(); log.mockRestore();
});
