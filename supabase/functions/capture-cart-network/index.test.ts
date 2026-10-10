import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';

const { getUser, from, upsert, lookupLocation, update } = vi.hoisted(() => ({
  getUser: vi.fn(), from: vi.fn(), upsert: vi.fn(), lookupLocation: vi.fn(), update: vi.fn(),
}));
vi.mock('./geolocation.ts', () => ({ lookupLocation }));
vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({
  createClient: () => ({ auth: { getUser }, from }),
}));
let handler: (request: Request) => Promise<Response>;
const cartId = '11111111-1111-4111-8111-111111111111';
let cart: unknown;
let blocked: unknown;
let existing: unknown;
let queryError: unknown;
const request = (ip = '203.0.113.9', body: unknown = { cartId }) => new Request('https://example.test/capture-cart-network', {
  method: 'POST', headers: { Authorization: 'Bearer test-session', 'Content-Type': 'application/json', 'x-forwarded-for': ip },
  body: JSON.stringify(body),
});

beforeAll(async () => {
  const env: Record<string, string> = {
    SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'test',
    SUPABASE_SERVICE_ROLE_KEY: 'test',
  };
  vi.stubGlobal('Deno', {
    env: { get: (name: string) => env[name] },
    serve: (callback: typeof handler) => { handler = callback; },
  });
  await import('./index');
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.clearAllMocks();
  cart = { id: cartId, expires_at: new Date(Date.now() + 86400_000).toISOString(), cart_items: [{ id: 'item' }] };
  blocked = null;
  existing = null;
  queryError = null;
  getUser.mockResolvedValue({ data: { user: { id: 'owner' } }, error: null });
  upsert.mockResolvedValue({ error: null });
  lookupLocation.mockResolvedValue(null);
  from.mockImplementation((table: string) => {
    const query = {
      select: () => query, eq: vi.fn(() => query), upsert,
      update: (values: unknown) => { update(values); return { eq: () => ({ eq: async () => ({ error: null }) }) }; },
      maybeSingle: async () => ({
        data: table === 'carts' ? cart : table === 'cart_session_blocks' ? blocked : existing,
        error: queryError,
      }),
    };
    return query;
  });
});

it('captures only the header IP, never a body IP, and never returns it', async () => {
  const response = await handler(request('203.0.113.9, 192.0.2.1', { cartId, ip: '198.51.100.4' }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ recorded: true, locationStatus: 'not_found' });
  expect(upsert).toHaveBeenCalledWith({ cart_id: cartId, ip_address: '203.0.113.9' },
    { onConflict: 'cart_id', ignoreDuplicates: true });
  const ownedQuery = from.mock.results[0].value;
  expect(ownedQuery.eq).toHaveBeenCalledWith('user_id', 'owner');
});
it('supports IPv6 addresses', async () => {
  expect((await handler(request('2001:db8::1'))).status).toBe(200);
  expect(upsert.mock.calls[0][0].ip_address).toBe('2001:db8::1');
});
it('does not overwrite the initial address or extend its retention', async () => {
  existing = { cart_id: cartId, location: { country: 'India' } };
  expect((await handler(request())).status).toBe(200);
  expect(upsert).not.toHaveBeenCalled();
});

it('enriches existing IPs without changing the original capture date', async () => {
  existing = { cart_id: cartId, ip_address: '203.0.113.9', captured_at: new Date().toISOString(), location: null };
  const location = { city: 'Meerut', region: 'Uttar Pradesh', country: 'India', countryCode: 'IN', provider: 'geolite2' };
  lookupLocation.mockResolvedValue(location);
  const response = await handler(request('198.51.100.1'));
  expect(await response.json()).toEqual({ recorded: true, locationStatus: 'available' });
  expect(lookupLocation).toHaveBeenCalledWith('203.0.113.9', expect.any(Function));
  expect(update).toHaveBeenCalledWith({ location });
  expect(upsert).not.toHaveBeenCalled();
});
it('preserves IP capture when the database is unavailable and logs the failure', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  lookupLocation.mockRejectedValue(new Error('Database unavailable'));
  expect(await (await handler(request())).json()).toEqual({ recorded: true, locationStatus: 'unavailable' });
  expect(log).toHaveBeenCalled();
  log.mockRestore();
});
it('requires authentication and valid input', async () => {
  expect((await handler(request('', { cartId: 'bad' }))).status).toBe(400);
  expect(from).not.toHaveBeenCalled();
  getUser.mockResolvedValue({ data: { user: null }, error: null });
  expect((await handler(request())).status).toBe(401);
  expect(upsert).not.toHaveBeenCalled();
});
it('rejects unowned, empty and expired carts', async () => {
  cart = null;
  expect((await handler(request())).status).toBe(400);
  cart = { id: cartId, expires_at: new Date(Date.now() + 10000).toISOString(), cart_items: [] };
  expect((await handler(request())).status).toBe(400);
  cart = { id: cartId, expires_at: '2020-01-01', cart_items: [{ id: 'item' }] };
  expect((await handler(request())).status).toBe(400);
  expect(upsert).not.toHaveBeenCalled();
});
it('rejects blocked sessions and missing or invalid IP headers', async () => {
  blocked = { user_id: 'owner' };
  expect((await handler(request())).status).toBe(403);
  blocked = null;
  expect((await handler(request(''))).status).toBe(503);
  expect((await handler(request('invalid-ip'))).status).toBe(503);
  expect(upsert).not.toHaveBeenCalled();
});
it('surfaces persistence and lookup errors', async () => {
  queryError = { message: 'DB unavailable' };
  expect((await handler(request())).status).toBe(500);
  queryError = null;
  upsert.mockResolvedValue({ error: { message: 'DB unavailable' } });
  expect((await handler(request())).status).toBe(500);
});
