import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';

const { getUser, rpc, from } = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn(), from: vi.fn() }));
vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({
  createClient: () => ({ auth: { getUser }, rpc, from }),
}));
let handler: (request: Request) => Promise<Response>;
const fetchMock = vi.fn();
const cartId = '11111111-1111-4111-8111-111111111111';
const location = { districts: ['Central Delhi'], states: ['Delhi'], country: 'India' };
let ownedCart: unknown;
let cached: unknown;
let saved: unknown;
let cacheWriteError: unknown;
let updateValues: unknown;
const request = (pin = '110001') => new Request('https://example.test/verify-delivery-pin', {
  method: 'POST', headers: { Authorization: 'Bearer test-placeholder', 'Content-Type': 'application/json' },
  body: JSON.stringify({ cartId, pin }),
});
beforeAll(async () => {
  vi.stubGlobal('Deno', {
    env: { get: (name: string) => ({ SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'test-placeholder', SUPABASE_SERVICE_ROLE_KEY: 'test-placeholder' })[name] },
    serve: (callback: typeof handler) => { handler = callback; },
  });
  await import('./index');
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.clearAllMocks();
  ownedCart = { id: cartId, expires_at: new Date(Date.now() + 86400_000).toISOString(), cart_items: [{ id: 'i1' }] };
  cached = null;
  saved = { id: cartId };
  cacheWriteError = null;
  updateValues = undefined;
  getUser.mockResolvedValue({ data: { user: { id: 'owner' } }, error: null });
  rpc.mockResolvedValue({ data: true, error: null });
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(JSON.stringify([{ Status: 'Success',
    PostOffice: [{ Pincode: '110001', Country: 'India', State: 'Delhi', District: 'Central Delhi' }] }])));
  vi.stubGlobal('fetch', fetchMock);
  from.mockImplementation((table: string) => {
    let updating = false;
    const query = {
      select: () => query, eq: () => query, gte: () => query, gt: () => query,
      update: (values: unknown) => { updating = true; updateValues = values; return query; },
      upsert: async () => ({ error: cacheWriteError }),
      maybeSingle: async () => ({ data: table === 'delivery_pin_cache' ? cached : updating ? saved : ownedCart, error: null }),
    };
    return query;
  });
});

it('verifies PINs and saves only server-derived area metadata', async () => {
  const response = await handler(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toHaveProperty('location', location);
  expect(updateValues).toMatchObject({ delivery_pin_code: '110001', delivery_pin_location: location });
  expect(fetchMock.mock.calls[0][0]).toBe('https://api.postalpincode.in/pincode/110001');
  expect(fetchMock.mock.calls[0][1]).not.toHaveProperty('headers');
});
it('uses a fresh cache without sending another upstream request', async () => {
  cached = { location, checked_at: new Date().toISOString() };
  expect((await handler(request())).status).toBe(200);
  expect(fetchMock).not.toHaveBeenCalled();
});
it('rejects invalid shapes before database or API calls', async () => {
  expect((await handler(request('000000'))).status).toBe(400);
  expect(from).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
});
it('rejects nonexistent PINs without touching the saved PIN', async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify([{ Status: 'Error', Message: 'No records found', PostOffice: null }])));
  expect((await handler(request('999999'))).status).toBe(422);
  expect(updateValues).toBeUndefined();
});
it('requires a valid authenticated cart owner', async () => {
  getUser.mockResolvedValue({ data: { user: null }, error: new Error('Expired') });
  expect((await handler(request())).status).toBe(401);
  expect(fetchMock).not.toHaveBeenCalled();
});
it('never looks up a cart not owned by the requester', async () => {
  ownedCart = null;
  expect((await handler(request())).status).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
});
it('rate limits repeated lookups before the upstream request', async () => {
  rpc.mockResolvedValue({ data: false, error: null });
  expect((await handler(request())).status).toBe(429);
  expect(fetchMock).not.toHaveBeenCalled();
});
it('rejects admin-blocked cart sessions before any postal lookup', async () => {
  rpc.mockResolvedValue({ data: null, error: { message: 'This cart session has been blocked.' } });
  const response = await handler(request());
  expect(response.status).toBe(403);
  expect(await response.json()).toHaveProperty('error', expect.stringContaining('blocked'));
  expect(fetchMock).not.toHaveBeenCalled();
  expect(updateValues).toBeUndefined();
});
it('surfaces upstream outages and preserves the saved PIN', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  fetchMock.mockRejectedValue(new Error('Timeout'));
  expect((await handler(request())).status).toBe(503);
  expect(updateValues).toBeUndefined();
  log.mockRestore();
});
it('does not claim success when cache or cart persistence fails', async () => {
  cacheWriteError = new Error('DB unavailable');
  expect((await handler(request())).status).toBe(500);
  expect(updateValues).toBeUndefined();
  cacheWriteError = null;
  saved = null;
  fetchMock.mockResolvedValue(new Response(JSON.stringify([{ Status: 'Success',
    PostOffice: [{ Pincode: '110001', Country: 'India', State: 'Delhi', District: 'Central Delhi' }] }])));
  expect((await handler(request())).status).toBe(500);
});
