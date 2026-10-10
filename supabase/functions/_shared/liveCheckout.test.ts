// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
const { getUser, rpc, from, create, fetchPayment } = vi.hoisted(() => ({
  getUser: vi.fn(), rpc: vi.fn(), from: vi.fn(), create: vi.fn(), fetchPayment: vi.fn(),
}));
vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({
  createClient: () => ({ auth: { getUser }, rpc, from }),
}));
vi.mock('npm:razorpay@2.9.8', () => ({
  default: class { orders = { create }; payments = { fetch: fetchPayment }; },
}));
import { handleLiveCheckout } from './liveCheckout';
const id = '11111111-1111-4111-8111-111111111111';
let env: Record<string, string>;
let saved: Record<string, unknown>;
const request = (body: unknown) => new Request('https://example.test/payment', {
  method: 'POST', headers: { Authorization: 'fixture' }, body: JSON.stringify(body),
});
const signature = createHmac('sha256','fixture-live-secret').update('order_livefixture|pay_livefixture').digest('hex');
const payment = { razorpay_order_id: 'order_livefixture', razorpay_payment_id: 'pay_livefixture', razorpay_signature: signature };
beforeAll(() => vi.stubGlobal('Deno', { env: { get: (name: string) => env[name] } }));
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.clearAllMocks();
  env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'fixture', SUPABASE_SERVICE_ROLE_KEY: 'fixture',
    RAZORPAY_LIVE_KEY_ID: 'rzp_live_fixture', RAZORPAY_LIVE_KEY_SECRET: 'fixture-live-secret', RAZORPAY_WEBHOOK_SECRET: 'fixture-webhook' };
  getUser.mockResolvedValue({ data: { user: { id: 'owner' } }, error: null });
  saved = { id, total_paise: 55000, currency: 'INR', status: 'creating_link', reference: 'LUV-LIVE',
    expires_at: new Date(Date.now()+1800000).toISOString(), razorpay_order_id: 'order_livefixture' };
  rpc.mockImplementation(async (name: string) => ({ data: name === 'prepare_live_checkout' ? saved : { status: 'paid' }, error: null }));
  create.mockResolvedValue({ id: 'order_livefixture', amount: 55000, currency: 'INR' });
  fetchPayment.mockResolvedValue({ id: 'pay_livefixture', order_id: 'order_livefixture', amount: 55000, currency: 'INR', status: 'captured' });
  from.mockImplementation(() => {
    const query = { select: () => query, eq: () => query, is: () => query, update: () => query,
      maybeSingle: async () => ({ data: saved, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve) };
    return query;
  });
});
it('creates using database totals and exposes only the public live key', async () => {
  const response = await handleLiveCheckout(request({ cartId: id, requestKey: id, amount: 1 }), 'create');
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ order_id: 'order_livefixture', amount: 55000, currency: 'INR',
    key_id: 'rzp_live_fixture', test_mode: false, reference: 'LUV-LIVE' });
  expect(create).toHaveBeenCalledWith({ amount: 55000, currency: 'INR', receipt: id });
});
it('does not create duplicate provider orders for ambiguous claims or completed orders', async () => {
  saved.provider_claimed_at = new Date().toISOString();
  expect((await handleLiveCheckout(request({ cartId: id, requestKey: id }), 'create')).status).toBe(409);
  saved.status = 'paid';
  expect((await handleLiveCheckout(request({ cartId: id, requestKey: id }), 'create')).status).toBe(409);
  expect(create).not.toHaveBeenCalled();
});
it('requires a live key and webhook setup before contacting the provider', async () => {
  env.RAZORPAY_LIVE_KEY_ID = 'rzp_test_fixture';
  expect((await handleLiveCheckout(request({ cartId: id, requestKey: id }), 'create')).status).toBe(503);
  expect(create).not.toHaveBeenCalled();
});
it('confirms only captured, signature-verified payments for the exact amount', async () => {
  const response = await handleLiveCheckout(request(payment), 'verify');
  expect(await response.json()).toEqual({ success: true, test_mode: false, payment_id: 'pay_livefixture', reference: 'LUV-LIVE' });
  expect(rpc).toHaveBeenCalledWith('settle_live_checkout', { p_order_id: id, payment_id: 'pay_livefixture', amount_paise: 55000, payment_currency: 'INR' });
  rpc.mockClear();
  fetchPayment.mockResolvedValue({ id: 'pay_livefixture', order_id: 'order_livefixture', amount: 1, currency: 'INR', status: 'captured' });
  expect((await handleLiveCheckout(request(payment), 'verify')).status).toBe(409);
  expect(rpc).not.toHaveBeenCalled();
});
it('rejects forged signatures without settling inventory or coupons', async () => {
  expect((await handleLiveCheckout(request({ ...payment, razorpay_signature: 'bad' }), 'verify')).status).toBe(400);
  expect(fetchPayment).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalled();
});
it.each([
  { currency: 'USD', order_id: 'order_livefixture', status: 'captured' },
  { currency: 'INR', order_id: 'order_other', status: 'captured' },
  { currency: 'INR', order_id: 'order_livefixture', status: 'authorized' },
])('rejects a nonmatching or uncaptured payment: %j', async fields => {
  fetchPayment.mockResolvedValue({ id: 'pay_livefixture', amount: 55000, ...fields });
  expect((await handleLiveCheckout(request(payment), 'verify')).status).toBe(409);
  expect(rpc).not.toHaveBeenCalled();
});
it('reports review-required payments instead of returning success', async () => {
  rpc.mockResolvedValue({ data: { status: 'review_required' }, error: null });
  const response = await handleLiveCheckout(request(payment), 'verify');
  expect(response.status).toBe(409);
  expect((await response.json()).error).toContain('Payment received');
});
