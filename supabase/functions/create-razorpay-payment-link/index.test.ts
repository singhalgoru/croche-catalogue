import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';

const { authGetUser, rpc, update, fetchMock } = vi.hoisted(() => ({
  authGetUser: vi.fn(),
  rpc: vi.fn(),
  update: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({
  createClient: () => ({
    auth: { getUser: authGetUser },
    rpc,
    from: () => ({ update: (...args: unknown[]) => {
      update(...args);
      return { eq: async () => ({ error: null }) };
    } }),
  }),
}));

let handler: (request: Request) => Promise<Response>;
const cartId = '11111111-1111-4111-8111-111111111111';
const requestKey = '22222222-2222-4222-8222-222222222222';
const order = {
  id: '33333333-3333-4333-8333-333333333333',
  reference: 'LUV-1234567890',
  status: 'creating_link',
  total_paise: 12500,
  expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  reused: false,
};
const body = {
  cartId,
  requestKey,
  customerName: 'Test Customer',
  customerContact: '9205907350',
  customerEmail: 'buyer@example.com',
  shippingRupees: 25,
};
const makeRequest = (payload: unknown = body, headers: Record<string, string> = {}) =>
  new Request('https://example.test/create-razorpay-payment-link', {
    method: 'POST',
    headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(payload),
  });

beforeAll(async () => {
  vi.stubGlobal('Deno', {
    env: { get: (name: string) => ({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'test-placeholder',
      SUPABASE_SERVICE_ROLE_KEY: 'test-placeholder',
      RAZORPAY_KEY_ID: 'rzp_test_placeholder',
      RAZORPAY_KEY_SECRET: 'test-placeholder',
    })[name] },
    serve: (callback: typeof handler) => { handler = callback; },
  });
  vi.stubGlobal('fetch', fetchMock);
  await import('./index');
});

afterAll(() => vi.unstubAllGlobals());

beforeEach(() => {
  vi.clearAllMocks();
  authGetUser.mockResolvedValue({ data: { user: { id: 'admin-user' } }, error: null });
  rpc.mockImplementation((name: string) => Promise.resolve({
    data: name === 'is_catalogue_admin' ? true : order,
    error: null,
  }));
  fetchMock.mockResolvedValue(new Response(JSON.stringify({
    id: 'plink_123',
    short_url: 'https://rzp.io/i/example',
  }), { status: 200 }));
});

it('creates a hosted Razorpay link using the server-prepared order amount', async () => {
  const response = await handler(makeRequest());
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    orderReference: order.reference,
    paymentUrl: 'https://rzp.io/i/example',
    reused: false,
  });
  expect(rpc).toHaveBeenCalledWith('prepare_payment_link_order', expect.objectContaining({
    p_cart_id: cartId,
    p_request_key: requestKey,
    p_customer_contact: '+919205907350',
    p_shipping_paise: 2500,
  }));
  const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(JSON.parse(String(options.body))).toMatchObject({
    amount: order.total_paise,
    currency: 'INR',
    accept_partial: false,
    reference_id: order.reference,
    notify: { sms: false, email: false },
  });
  expect(options.headers).toMatchObject({ 'Content-Type': 'application/json' });
});

it('requires authentication and catalogue admin access', async () => {
  expect((await handler(new Request('https://example.test', { method: 'POST' }))).status).toBe(401);
  rpc.mockImplementation((name: string) => Promise.resolve({
    data: name === 'is_catalogue_admin' ? false : null,
    error: null,
  }));
  expect((await handler(makeRequest())).status).toBe(403);
  expect(fetchMock).not.toHaveBeenCalled();
});

it('rejects malformed customer and cart data before preparing an order', async () => {
  const response = await handler(makeRequest({ ...body, customerContact: '123' }));
  expect(response.status).toBe(400);
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(fetchMock).not.toHaveBeenCalled();
});

it('returns an existing link for a repeated idempotent request', async () => {
  rpc.mockImplementation((name: string) => Promise.resolve({
    data: name === 'is_catalogue_admin' ? true : {
      ...order,
      status: 'link_created',
      payment_url: 'https://rzp.io/i/previous',
      reused: true,
    },
    error: null,
  }));
  const response = await handler(makeRequest());
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    paymentUrl: 'https://rzp.io/i/previous',
    reused: true,
  });
  expect(fetchMock).not.toHaveBeenCalled();
});

it('does not create a second link when an earlier request is ambiguous', async () => {
  rpc.mockImplementation((name: string) => Promise.resolve({
    data: name === 'is_catalogue_admin' ? true : { ...order, reused: true },
    error: null,
  }));
  const response = await handler(makeRequest());
  expect(response.status).toBe(409);
  expect(fetchMock).not.toHaveBeenCalled();
});

it('returns a conflict when the cart already has an active payment link', async () => {
  rpc.mockImplementation((name: string) => Promise.resolve(name === 'is_catalogue_admin'
    ? { data: true, error: null }
    : { data: null, error: { message: 'This cart already has a pending payment link (LUV-123).' } }));
  const response = await handler(makeRequest());
  expect(response.status).toBe(409);
  expect((await response.json()).error).toContain('pending payment link');
  expect(fetchMock).not.toHaveBeenCalled();
});

it('retains the reservation for an ambiguous network failure', async () => {
  fetchMock.mockRejectedValue(new Error('Network timeout'));
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const response = await handler(makeRequest());
  expect(response.status).toBe(502);
  expect(await response.json()).toMatchObject({ orderReference: order.reference });
  expect(update).not.toHaveBeenCalled();
  log.mockRestore();
});

it('marks a definite Razorpay rejection as link_failed', async () => {
  fetchMock.mockResolvedValue(new Response('{}', { status: 400 }));
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  expect((await handler(makeRequest())).status).toBe(502);
  expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'link_failed' }));
  log.mockRestore();
});

it('retains the reservation when Razorpay returns an ambiguous server error', async () => {
  fetchMock.mockResolvedValue(new Response('{}', { status: 500 }));
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  expect((await handler(makeRequest())).status).toBe(502);
  expect(update).not.toHaveBeenCalled();
  log.mockRestore();
});
