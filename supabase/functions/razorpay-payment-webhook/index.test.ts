import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({
  createClient: () => ({ rpc }),
}));

let handler: (request: Request) => Promise<Response>;
const secret = 'webhook-test-secret';
const payload = {
  event: 'payment_link.paid',
  payload: {
    payment_link: { entity: { id: 'plink_123', amount: 12500 } },
    payment: { entity: { id: 'pay_123', amount: 12500 } },
  },
};

const signedRequest = async (value: unknown = payload, signatureOverride?: string) => {
  const body = JSON.stringify(value);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
  const signature = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return new Request('https://example.test/razorpay-payment-webhook', {
    method: 'POST',
    headers: {
      'x-razorpay-signature': signatureOverride ?? signature,
      'x-razorpay-event-id': 'evt_123',
      'Content-Type': 'application/json',
    },
    body,
  });
};

beforeAll(async () => {
  vi.stubGlobal('Deno', {
    env: { get: (name: string) => ({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-placeholder',
      RAZORPAY_WEBHOOK_SECRET: secret,
    })[name] },
    serve: (callback: typeof handler) => { handler = callback; },
  });
  await import('./index');
});
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ data: { processed: true, status: 'paid' }, error: null });
});

it('verifies the raw-body signature before forwarding the event', async () => {
  const response = await handler(await signedRequest());
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ received: true, status: 'paid' });
  expect(rpc).toHaveBeenCalledWith('record_razorpay_payment_event', {
    p_event_id: 'evt_123',
    p_event_name: 'payment_link.paid',
    p_link_id: 'plink_123',
    p_payment_id: 'pay_123',
    p_amount_paise: 12500,
  });
});

it('rejects an invalid signature without calling the database', async () => {
  const response = await handler(await signedRequest(payload, '0'.repeat(64)));
  expect(response.status).toBe(401);
  expect(rpc).not.toHaveBeenCalled();
});

it('rejects unsigned requests and methods other than POST', async () => {
  expect((await handler(new Request('https://example.test', { method: 'GET' }))).status).toBe(405);
  const response = await handler(new Request('https://example.test', {
    method: 'POST', headers: { 'x-razorpay-event-id': 'evt_123' }, body: '{}',
  }));
  expect(response.status).toBe(401);
  expect(rpc).not.toHaveBeenCalled();
});

it('uses captured payment amount, allowing SQL to detect underpayment', async () => {
  const underpaid = structuredClone(payload);
  underpaid.payload.payment.entity.amount = 100;
  const response = await handler(await signedRequest(underpaid));
  expect(response.status).toBe(200);
  expect(rpc).toHaveBeenCalledWith('record_razorpay_payment_event',
    expect.objectContaining({ p_amount_paise: 100 }));
});

it('returns a retryable error when the database does not yet know the link', async () => {
  rpc.mockResolvedValue({ data: { processed: false, reason: 'unknown_payment_link' }, error: null });
  expect((await handler(await signedRequest())).status).toBe(500);
});

it('acknowledges unsupported but validly signed events without mutating payment state', async () => {
  const response = await handler(await signedRequest({ event: 'payment.authorized', payload: {} }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ received: true, ignored: true });
  expect(rpc).not.toHaveBeenCalled();
});

const checkout = {
  event: 'payment.captured',
  payload: { payment: { entity: {
    id: 'pay_checkout', order_id: 'order_checkout', amount: 12500, currency: 'INR', status: 'captured',
  } } },
};

it('reconciles captured Standard Checkout payments through the shared ledger', async () => {
  rpc.mockResolvedValue({ data: { processed: true, status: 'test_verified', test_mode: true }, error: null });
  const response = await handler(await signedRequest(checkout));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ status: 'test_verified', test_mode: true });
  expect(rpc).toHaveBeenCalledWith('record_razorpay_checkout_event', {
    p_event_id: 'evt_123', p_event_name: 'payment.captured', p_order_id: 'order_checkout',
    p_payment_id: 'pay_checkout', p_amount_paise: 12500, p_currency: 'INR',
  });
});

it('validates paid order details against the captured payment', async () => {
  const event = { ...checkout, event: 'order.paid', payload: {
    ...checkout.payload, order: { entity: { id: 'order_checkout', amount: 12500, currency: 'INR', status: 'paid' } },
  } };
  expect((await handler(await signedRequest(event))).status).toBe(200);
  rpc.mockClear();
  event.payload.order.entity.amount = 100;
  expect((await handler(await signedRequest(event))).status).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
});

it('rejects uncaptured payments and malformed checkout events', async () => {
  const event = structuredClone(checkout);
  event.payload.payment.entity.status = 'authorized';
  expect((await handler(await signedRequest(event))).status).toBe(400);
  expect((await handler(await signedRequest({ event: 'payment.captured', payload: {} }))).status).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
});

it('returns retryable errors for unknown checkout orders and database failures', async () => {
  rpc.mockResolvedValue({ data: { reason: 'unknown_checkout_order' }, error: null });
  expect((await handler(await signedRequest(checkout))).status).toBe(500);
  rpc.mockResolvedValue({ data: null, error: { message: 'Database unavailable' } });
  expect((await handler(await signedRequest(checkout))).status).toBe(500);
});

it('acknowledges duplicate events after database validation', async () => {
  rpc.mockResolvedValue({ data: { processed: false, duplicate: true }, error: null });
  const response = await handler(await signedRequest(checkout));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ duplicate: true });
});
