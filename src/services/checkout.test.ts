import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createCheckoutOrder, verifyCheckoutPayment, readCheckoutRecovery, saveCheckoutRecovery } from './checkout';
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../lib/supabaseConfig', () => ({ loadSupabase: async () => ({ functions: { invoke } }) }));
const valid = { order_id: 'order_test', amount: 100, currency: 'INR',
  key_id: 'rzp_test_fixture', test_mode: true, reference: 'TEST-123' };
const body = { cartId: 'cart', requestKey: 'key', customerName: 'Buyer', customerPhone: '9999999999' };
beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); });
afterEach(() => vi.restoreAllMocks());
it('accepts minimum 100 paise and rejects malformed, live or below-minimum responses', async () => {
  invoke.mockResolvedValue({ data: valid, error: null });
  expect(await createCheckoutOrder(body)).toEqual(valid);
  for (const malformed of [{ ...valid, amount: 99 }, { ...valid, amount: 100.5 },
    { ...valid, key_id: 'rzp_live_fixture' }, { ...valid, test_mode: false },
    { ...valid, currency: 'USD' }, { ...valid, order_id: 'invalid' }, null]) {
    invoke.mockResolvedValue({ data: malformed, error: null });
    await expect(createCheckoutOrder(body)).rejects.toThrow('invalid test order');
  }
});
it('requires explicit verification success for the exact test payment', async () => {
  const payment = { razorpay_order_id: 'order_test', razorpay_payment_id: 'pay_test', razorpay_signature: 'fixture' };
  invoke.mockResolvedValue({ data: { success: true, test_mode: true, payment_id: 'pay_test' }, error: null });
  expect(await verifyCheckoutPayment(payment)).toBe('pay_test');
  invoke.mockResolvedValue({ data: { success: true, test_mode: true, payment_id: 'pay_other' }, error: null });
  await expect(verifyCheckoutPayment(payment)).rejects.toThrow('do not pay again');
});
it('routes live orders separately and rejects test credentials in live responses', async () => {
  const live = { ...valid, key_id: 'rzp_live_fixture', test_mode: false, reference: 'LUV-LIVE' };
  invoke.mockResolvedValue({ data: live, error: null });
  expect(await createCheckoutOrder(body, true)).toEqual(live);
  expect(invoke).toHaveBeenCalledWith('create-live-order', { body });
  invoke.mockResolvedValue({ data: valid, error: null });
  await expect(createCheckoutOrder(body, true)).rejects.toThrow();
  const payment = { razorpay_order_id: 'order_live', razorpay_payment_id: 'pay_live', razorpay_signature: 'fixture' };
  invoke.mockResolvedValue({ data: { success: true, test_mode: false, payment_id: 'pay_live', reference: 'LUV-LIVE' }, error: null });
  expect(await verifyCheckoutPayment(payment, true)).toBe('LUV-LIVE');
  expect(invoke).toHaveBeenCalledWith('verify-live-payment', { body: payment });
});
it('surfaces the backend error message', async () => {
  invoke.mockResolvedValue({ data: null, error: { message: 'Function failed',
    context: new Response(JSON.stringify({ error: 'Cart item unavailable.' })) } });
  await expect(createCheckoutOrder(body)).rejects.toThrow('Cart item unavailable.');
});
it('round-trips request and payment recovery without silently ignoring corruption', () => {
  const recovery = { request: { fingerprint: 'cart-items', key: 'key' },
    pending: { razorpay_order_id: 'order_test', razorpay_payment_id: 'pay_test', razorpay_signature: 'fixture' },
    verified: false };
  saveCheckoutRecovery('cart', recovery);
  expect(readCheckoutRecovery('cart')).toEqual(recovery);
  sessionStorage.setItem('luvia-checkout-cart', '{"verified":false,"request":{},"pending":null}');
  expect(() => readCheckoutRecovery('cart')).toThrow('Invalid checkout request');
});
