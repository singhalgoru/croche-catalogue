// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { validSignature } from './razorpay';

const { create, fetchPayment, getUser, rpc, from, updates } = vi.hoisted(() => ({
  create: vi.fn(), fetchPayment: vi.fn(), getUser: vi.fn(), rpc: vi.fn(), from: vi.fn(), updates: vi.fn(),
}));
vi.mock('npm:razorpay@2.9.8', () => ({
  default: class { orders = { create }; payments = { fetch: fetchPayment }; },
}));
vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({
  createClient: () => ({ auth: { getUser }, rpc, from }),
}));
let createHandler: (request: Request) => Promise<Response>;
let verifyHandler: typeof createHandler;
const cartId = '11111111-1111-4111-8111-111111111111';
const signature = createHmac('sha256', 'fixture-secret').update('order_test|pay_test').digest('hex');
const paymentResponse = { razorpay_order_id: 'order_test', razorpay_payment_id: 'pay_test', razorpay_signature: signature };
let saved: Record<string, unknown> | null;
let blocked: boolean;
let claim: boolean;
let keyId: string;
const request = (body: unknown, authenticated = true) => new Request('https://example.test/payment', {
  method: 'POST', headers: authenticated ? { Authorization: 'Bearer fixture' } : {}, body: JSON.stringify(body),
});
const orderRequest = { cartId, requestKey: cartId, customerName: 'Test Buyer', customerPhone: '9876543210', amount: 1 };
beforeAll(async () => {
  const env: Record<string, string> = {
    SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'fixture',
    SUPABASE_SERVICE_ROLE_KEY: 'fixture', RAZORPAY_KEY_SECRET: 'fixture-secret',
  };
  vi.stubGlobal('Deno', {
    env: { get: (name: string) => name === 'RAZORPAY_KEY_ID' ? keyId : env[name] },
    serve: (callback: typeof createHandler) => { createHandler = callback; },
  });
  await import('../create-order/index');
  const first = createHandler;
  await import('../verify-payment/index');
  verifyHandler = createHandler;
  createHandler = first;
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.clearAllMocks();
  keyId = 'rzp_test_fixture';
  saved = { id: cartId, total_paise: 55000, currency: 'INR', status: 'checkout_created', razorpay_order_id: 'order_test' };
  blocked = false;
  claim = true;
  getUser.mockResolvedValue({ data: { user: { id: 'owner' } }, error: null });
  rpc.mockImplementation(async (name: string) => name === 'prepare_checkout_payment'
    ? { data: { id: cartId, total_paise: 55000, status: 'creating_checkout', reference: 'TEST-123' }, error: null }
    : { error: null });
  create.mockResolvedValue({ id: 'order_test', amount: 55000, currency: 'INR' });
  fetchPayment.mockResolvedValue({ id: 'pay_test', order_id: 'order_test', amount: 55000, currency: 'INR', status: 'captured' });
  from.mockImplementation((table: string) => {
    let updating = false;
    const query = {
      select: () => query, eq: vi.fn(() => query),
      update: (values: unknown) => { updating = true; updates(values); return query; },
      maybeSingle: async () => ({ data: updating ? claim ? { id: cartId } : null
        : table === 'cart_session_blocks' ? blocked ? { user_id: 'owner' } : null : saved, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve),
    };
    return query;
  });
});
it('verifies HMAC and rejects malformed, forged and replayed signatures', async () => {
  expect(await validSignature('order_test', 'pay_test', signature, 'fixture-secret')).toBe(true);
  expect(await validSignature('order_other', 'pay_test', signature, 'fixture-secret')).toBe(false);
  expect(await validSignature('order_test', 'pay_other', signature, 'fixture-secret')).toBe(false);
  expect(await validSignature('order_test', 'pay_test', 'bad', 'fixture-secret')).toBe(false);
});
it('creates an order using server totals, not browser amounts, and never returns the secret', async () => {
  const response = await createHandler(request(orderRequest));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ order_id: 'order_test', amount: 55000, currency: 'INR',
    key_id: 'rzp_test_fixture', test_mode: true, reference: 'TEST-123' });
  expect(create).toHaveBeenCalledWith({ amount: 55000, currency: 'INR', receipt: cartId });
  expect(rpc).toHaveBeenCalledWith('prepare_checkout_payment', expect.objectContaining({ owner_id: 'owner' }));
});
it('requires authentication, a cart and customer fields', async () => {
  expect((await createHandler(request(orderRequest, false))).status).toBe(401);
  expect((await createHandler(request({ cartId }))).status).toBe(400);
  getUser.mockResolvedValue({ data: { user: null }, error: null });
  expect((await verifyHandler(request(paymentResponse))).status).toBe(401);
  expect(create).not.toHaveBeenCalled();
});
it('returns SQL ownership, blocked-session and availability validation failures', async () => {
  rpc.mockResolvedValue({ error: { message: 'Cart item unavailable.' } });
  const response = await createHandler(request(orderRequest));
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: 'Cart item unavailable.' });
  expect(create).not.toHaveBeenCalled();
});
it('reuses an existing provider order and rejects concurrent claims', async () => {
  rpc.mockResolvedValue({ data: { ...saved, reference: 'TEST-123' }, error: null });
  expect((await createHandler(request(orderRequest))).status).toBe(200);
  expect(create).not.toHaveBeenCalled();
  rpc.mockResolvedValue({ data: { ...saved, status: 'creating_checkout' }, error: null });
  claim = false;
  expect((await createHandler(request(orderRequest))).status).toBe(409);
  expect(create).not.toHaveBeenCalled();
});
it('does not retry ambiguous or already verified checkouts', async () => {
  for (const status of ['checkout_claimed', 'test_verified']) {
    rpc.mockResolvedValue({ data: { ...saved, status }, error: null });
    expect((await createHandler(request(orderRequest))).status).toBe(409);
  }
  expect(create).not.toHaveBeenCalled();
});
it('rejects live keys and under-minimum amounts; surfaces provider auth failures', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  keyId = 'rzp_live_fixture';
  expect((await createHandler(request(orderRequest))).status).toBe(500);
  keyId = 'rzp_test_fixture';
  rpc.mockResolvedValue({ data: { total_paise: 99 }, error: null });
  expect((await createHandler(request(orderRequest))).status).toBe(500);
  rpc.mockResolvedValue({ data: { ...saved, status: 'creating_checkout' }, error: null });
  create.mockRejectedValue({ statusCode: 401 });
  expect((await createHandler(request(orderRequest))).status).toBe(401);
  expect(updates).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'link_failed' }));
  log.mockRestore();
});
it('requires all signature fields and rejects unowned orders and forged signatures without writing', async () => {
  expect((await verifyHandler(request({}))).status).toBe(400);
  saved = null;
  expect((await verifyHandler(request(paymentResponse))).status).toBe(400);
  saved = { id: cartId, razorpay_order_id: 'order_other' };
  expect((await verifyHandler(request(paymentResponse))).status).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
  expect(fetchPayment).not.toHaveBeenCalled();
});
it('requires captured payments with matching order, currency and amount', async () => {
  for (const mismatch of [{ status: 'authorized' }, { amount: 1 }, { currency: 'USD' }, { order_id: 'order_other' }, { id: 'pay_other' }]) {
    fetchPayment.mockResolvedValue({ id: 'pay_test', order_id: 'order_test', amount: 55000,
      currency: 'INR', status: 'captured', ...mismatch });
    expect((await verifyHandler(request(paymentResponse))).status).toBe(409);
  }
  expect(rpc).not.toHaveBeenCalled();
});
it('verifies the expected payment idempotently and checks blocked sessions', async () => {
  expect((await verifyHandler(request(paymentResponse))).status).toBe(200);
  expect(rpc).toHaveBeenCalledWith('verify_test_checkout', { order_id: cartId, owner_id: 'owner', payment_id: 'pay_test' });
  saved = { ...saved, status: 'test_verified', razorpay_payment_id: 'pay_test' };
  fetchPayment.mockClear();
  expect((await verifyHandler(request(paymentResponse))).status).toBe(200);
  expect(fetchPayment).not.toHaveBeenCalled();
  blocked = true;
  expect((await verifyHandler(request(paymentResponse))).status).toBe(403);
});
it('reports persistence failures without claiming success', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  rpc.mockResolvedValue({ error: { message: 'DB unavailable' } });
  expect((await verifyHandler(request(paymentResponse))).status).toBe(500);
  log.mockRestore();
});
