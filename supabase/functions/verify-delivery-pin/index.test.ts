import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';

const { getUser, rpc, from } = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn(), from: vi.fn() }));
vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({
  createClient: () => ({ auth: { getUser }, rpc, from }),
}));
let handler: (request: Request) => Promise<Response>;
const fetchMock = vi.fn();
const cartId = '11111111-1111-4111-8111-111111111111';
const location = { districts: [], cities: ['Central Delhi'], states: ['Delhi'], country: 'India', provider: 'shiprocket' };
const postalPayload = { success: true,
  postcode_details: { postcode: '110001', country: 'India', state: 'Delhi', city: 'Central Delhi' } };
let ownedCart: unknown;
let cached: unknown;
let saved: unknown;
let cacheWriteError: unknown;
let updateValues: unknown;
let env: Record<string, string>;
let rateCached: unknown;
const upserts: { table: string; values: unknown }[] = [];
const baseEnv = { SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'test-placeholder', SUPABASE_SERVICE_ROLE_KEY: 'test-placeholder' };
const shiprocketEnv = { ...baseEnv, SHIPROCKET_EMAIL: 'api@example.test',
  SHIPROCKET_PASSWORD: 'test-placeholder', SHIPROCKET_PICKUP_PINCODE: '400001' };
const request = (pin = '110001') => new Request('https://example.test/verify-delivery-pin', {
  method: 'POST', headers: { Authorization: 'Bearer test-placeholder', 'Content-Type': 'application/json' },
  body: JSON.stringify({ cartId, pin }),
});
beforeAll(async () => {
  env = baseEnv;
  vi.stubGlobal('Deno', {
    env: { get: (name: string) => env[name] },
    serve: (callback: typeof handler) => { handler = callback; },
  });
  await import('./index');
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.clearAllMocks();
  ownedCart = { id: cartId, expires_at: new Date(Date.now() + 86400_000).toISOString(), cart_items: [{ id: 'i1', quantity: 1 }] };
  cached = null;
  saved = { id: cartId };
  cacheWriteError = null;
  updateValues = undefined;
  env = baseEnv;
  rateCached = null;
  upserts.length = 0;
  getUser.mockResolvedValue({ data: { user: { id: 'owner' } }, error: null });
  rpc.mockResolvedValue({ data: true, error: null });
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(JSON.stringify(postalPayload)));
  vi.stubGlobal('fetch', fetchMock);
  from.mockImplementation((table: string) => {
    let updating = false;
    const query = {
      select: () => query, eq: () => query, gte: () => query, gt: () => query,
      update: (values: unknown) => { updating = true; updateValues = values; return query; },
      upsert: async (values: unknown) => { upserts.push({ table, values }); return { error: cacheWriteError }; },
      maybeSingle: async () => ({ data: table === 'delivery_pin_cache' ? cached
        : table === 'delivery_rate_cache' ? rateCached
          : table === 'shiprocket_auth_tokens' ? { token: 'cached-token' }
            : updating ? saved : ownedCart, error: null }),
    };
    return query;
  });
});

it('verifies PINs and saves only server-derived area metadata', async () => {
  const response = await handler(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toHaveProperty('location', location);
  expect(updateValues).toMatchObject({ delivery_pin_code: '110001', delivery_pin_location: location });
  expect(fetchMock.mock.calls[0][0]).toBe('https://apiv2.shiprocket.in/v1/external/open/postcode/details?postcode=110001');
  expect(fetchMock.mock.calls[0][1]).not.toHaveProperty('headers');
});
it.each(['122050', '999999'])('saves format-valid PIN %s when the postal lookup has no record and returns a warning', async pin => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ code: 403, message: `City/State not found for this pincode : ${pin}` }), { status: 500 }));
  const response = await handler(request(pin));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    location: null,
    warning: expect.stringContaining('double-check it'),
  });
  expect(updateValues).toMatchObject({
    delivery_pin_code: pin, delivery_pin_location: null,
    delivery_pin_checked_at: expect.any(String),
  });
  expect(upserts).not.toContainEqual(expect.objectContaining({ table: 'delivery_pin_cache' }));
});
it('uses a fresh cache without sending another upstream request', async () => {
  cached = { location, checked_at: new Date().toISOString() };
  expect((await handler(request())).status).toBe(200);
  expect(fetchMock).not.toHaveBeenCalled();
});
it('refreshes old provider cache entries using Shiprocket', async () => {
  cached = { location: { districts: ['Central Delhi'], states: ['Delhi'], country: 'India' }, checked_at: new Date().toISOString() };
  expect((await handler(request())).status).toBe(200);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(updateValues).toMatchObject({ delivery_pin_location: location });
});
it('recognizes Manesar PIN 122050 through Shiprocket', async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: true,
    postcode_details: { postcode: '122050', city: 'Manesar', state: 'Haryana', country: 'India' } })));
  const response = await handler(request('122050'));
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.location).toMatchObject({ cities: ['Manesar'], states: ['Haryana'], provider: 'shiprocket' });
  expect(body).not.toHaveProperty('warning');
});
it('does not treat a generic provider HTTP 500 as an unknown PIN', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ message: 'Internal server error' }), { status: 500 }));
  expect((await handler(request())).status).toBe(503);
  expect(updateValues).toBeUndefined();
  log.mockRestore();
});
it('rejects invalid shapes before database or API calls', async () => {
  expect((await handler(request('000000'))).status).toBe(400);
  expect(from).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
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
  fetchMock.mockResolvedValue(new Response(JSON.stringify(postalPayload)));
  expect((await handler(request())).status).toBe(500);
});
it('skips Shiprocket entirely until it is configured', async () => {
  const response = await handler(request());
  expect(await response.json()).toHaveProperty('estimate', null);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(updateValues).toMatchObject({ delivery_estimate: null });
});
it('saves a Shiprocket estimate for the cart quantity', async () => {
  env = shiprocketEnv;
  ownedCart = { ...(ownedCart as object), cart_items: [{ id: 'i1', quantity: 2 }, { id: 'i2', quantity: 2 }] };
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(postalPayload)))
    .mockResolvedValueOnce(new Response(JSON.stringify({ data: { available_courier_companies: [{ rate: 72.5, estimated_delivery_days: '4' }] } })));
  const body = await (await handler(request())).json();
  expect(body.estimate).toMatchObject({ provider: 'shiprocket', minCharge: 73, maxCharge: 73, weightGrams: 700, itemCount: 4 });
  expect(fetchMock.mock.calls[1][0]).toContain('delivery_postcode=110001&weight=0.7&cod=0');
  expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer cached-token');
  expect(updateValues).toMatchObject({ delivery_estimate: body.estimate });
  expect(upserts).toContainEqual(expect.objectContaining({ table: 'delivery_rate_cache' }));
});
it('reuses a fresh rate quote without calling Shiprocket', async () => {
  env = shiprocketEnv;
  cached = { location, checked_at: new Date().toISOString() };
  rateCached = { estimate: { provider: 'shiprocket', currency: 'INR', minCharge: 60, maxCharge: 80, minDays: 3, maxDays: 5, weightGrams: 500 }, checked_at: '2026-01-01T00:00:00.000Z' };
  const body = await (await handler(request())).json();
  expect(body.estimate).toMatchObject({ minCharge: 60, itemCount: 1, checkedAt: '2026-01-01T00:00:00.000Z' });
  expect(fetchMock).not.toHaveBeenCalled();
});
it('still saves the PIN when Shiprocket is unavailable', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  env = shiprocketEnv;
  cached = { location, checked_at: new Date().toISOString() };
  fetchMock.mockRejectedValue(new Error('Timeout'));
  const response = await handler(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toHaveProperty('estimate', null);
  expect(updateValues).toMatchObject({ delivery_pin_code: '110001', delivery_estimate: null });
  log.mockRestore();
});
