import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import RazorpayCheckout from './RazorpayCheckout';
import type { Cart } from '../types/cart';
import type { CheckoutOptions } from '../services/checkout';
const { createOrder, verify, load, status, recovery } = vi.hoisted(() => ({
  createOrder: vi.fn(), verify: vi.fn(), load: vi.fn(), status: vi.fn(), recovery: vi.fn(),
}));
const purchase = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const optInMock = vi.hoisted(() => vi.fn());
vi.mock('../services/purchaseAnalytics', () => ({ trackVerifiedPurchase: purchase }));
vi.mock('../services/googleCustomerReviews', () => ({
  calculateEstimatedDeliveryDate: () => '2026-10-25',
  renderGoogleCustomerReviewsOptIn: optInMock,
}));
vi.mock('../services/checkout', async importOriginal => ({
  ...await importOriginal<typeof import('../services/checkout')>(),
  createCheckoutOrder: createOrder, verifyCheckoutPayment: verify, loadRazorpay: load,
  fetchLiveCheckoutStatus: status, fetchLiveCheckoutRecovery: recovery,
}));
const cart: Cart = {
  id: 'cart-fixture', reference: 'CRT-TEST', status: 'active', updatedAt: '', expiresAt: '', whatsappStartedAt: null,
  items: [],
};
let options: CheckoutOptions;
let failed: (value: { error: { description: string } }) => void;
let open: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  status.mockResolvedValue(null);
  recovery.mockResolvedValue(null);
  sessionStorage.clear();
  open = vi.fn();
  load.mockResolvedValue(class {
    constructor(value: CheckoutOptions) { options = value; }
    open = open;
    on(_event: string, callback: typeof failed) { failed = callback; }
  });
  createOrder.mockResolvedValue({ order_id: 'order_test', amount: 17000, currency: 'INR',
    key_id: 'rzp_test_fixture', test_mode: true, reference: 'TEST-123' });
  verify.mockResolvedValue('pay_test');
});
afterEach(cleanup);
async function proceed() {
  const button = screen.getByRole('button', { name: 'Proceed to payment' });
  await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
  fireEvent.click(button);
}
async function start() {
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Test Buyer' } });
  fireEvent.change(screen.getByLabelText('Indian mobile number'), { target: { value: '9876543210' } });
  fireEvent.click(screen.getByRole('button', { name: 'Try Razorpay test checkout' }));
  await waitFor(() => expect(open).toHaveBeenCalled());
}
it('opens the modal with the server order and labels it as test-only', async () => {
  render(<RazorpayCheckout cart={cart} disabled={false} />);
  await start();
  expect(options).toMatchObject({ key: 'rzp_test_fixture', order_id: 'order_test', amount: 17000 });
  expect(createOrder).toHaveBeenCalledWith(expect.objectContaining({ cartId: 'cart-fixture', customerPhone: '9876543210' }));
  expect(screen.getByRole('status').textContent).toContain('No real money');
  expect(screen.getByRole('button', { name: 'Test checkout in progress…' }).hasAttribute('disabled')).toBe(true);
  expect(purchase).not.toHaveBeenCalled();
});
it('uses saved delivery details and confirms a real order only after backend verification', async () => {
  createOrder.mockResolvedValue({ order_id: 'order_live', amount: 55000, currency: 'INR',
    key_id: 'rzp_live_fixture', test_mode: false, reference: 'LUV-LIVE' });
  verify.mockResolvedValue('LUV-LIVE');
  render(<RazorpayCheckout cart={{ ...cart, deliveryDetails: { name: 'Buyer', phone: '9876543210',
    email: 'buyer@example.test', addressLine1: '12 Test Street', addressLine2: '', city: 'Delhi', state: 'Delhi', pincode: '110001' } }}
    disabled={false} live />);
  expect(screen.queryByLabelText('Name')).toBeNull();
  await proceed();
  await waitFor(() => expect(open).toHaveBeenCalled());
  expect(options.description).toBe('Order LUV-LIVE');
  expect(options.prefill).toEqual({ name: 'Buyer', contact: '+919876543210' });
  const response = { razorpay_order_id: 'order_live', razorpay_payment_id: 'pay_live', razorpay_signature: 'fixture' };
  options.handler(response);
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Order confirmed — LUV-LIVE'));
  expect(screen.getByRole('heading', { name: 'Thank you! Your order is confirmed.' })).toBeTruthy();
  expect(screen.getByText(/Please check your inbox and Spam folder/)).toBeTruthy();
  const whatsapp = screen.getByRole('link', { name: 'Send order to seller on WhatsApp' });
  expect(whatsapp.getAttribute('href')).toContain('wa.me/919205907350');
  expect(new URL(whatsapp.getAttribute('href')!).searchParams.get('text')).toContain('Order reference: LUV-LIVE');
  expect(screen.queryByText(/Close any earlier payment windows/)).toBeNull();
  expect(verify).toHaveBeenCalledWith(response, true);
  expect(screen.queryByRole('button', { name: 'Proceed to payment' })).toBeNull();
  await waitFor(() => expect(purchase).toHaveBeenCalledWith(createOrder.mock.calls[0][0].requestKey));
  expect(optInMock).toHaveBeenCalledWith(expect.objectContaining({
    orderId: 'LUV-LIVE',
    email: 'buyer@example.test',
    deliveryCountry: 'IN',
    estimatedDeliveryDate: '2026-10-25',
  }));
});
it('shows cancellation and payment failure messages and reuses the same request on retry', async () => {
  render(<RazorpayCheckout cart={cart} disabled={false} />);
  await start();
  fireEvent.click(screen.getByRole('button', { name: 'Test checkout in progress…' }));
  expect(createOrder).toHaveBeenCalledTimes(1);
  failed({ error: { description: 'Test payment declined' } });
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('declined'));
  options.modal.ondismiss();
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('closed'));
  fireEvent.click(screen.getByRole('button', { name: 'Try Razorpay test checkout' }));
  await waitFor(() => expect(createOrder).toHaveBeenCalledTimes(2));
  expect(createOrder.mock.calls[0][0].requestKey).toBe(createOrder.mock.calls[1][0].requestKey);
});
it('recovers webhook confirmation after losing the browser payment callback', async () => {
  sessionStorage.setItem(`luvia-checkout-live-${cart.id}`, JSON.stringify({
    request: { fingerprint: 'saved-cart', key: 'saved-request' }, pending: null, verified: false,
  }));
  status.mockResolvedValue({ status: 'paid', reference: 'LUV-RECOVERED' });
  render(<RazorpayCheckout cart={cart} disabled={false} live />);
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Order confirmed — LUV-RECOVERED'));
  expect(screen.getByRole('heading', { name: 'Thank you! Your order is confirmed.' })).toBeTruthy();
  expect(status).toHaveBeenCalledWith('saved-request');
  expect(createOrder).not.toHaveBeenCalled();
  expect(verify).not.toHaveBeenCalled();
  await waitFor(() => expect(purchase).toHaveBeenCalledWith('saved-request'));
  expect(screen.queryByRole('button', { name: 'Proceed to payment' })).toBeNull();
});
it('syncs a recoverable live checkout from another device and resumes the same request', async () => {
  recovery.mockResolvedValue({ requestKey: 'remote-request', status: 'link_created', reference: 'LUV-REMOTE', cartMatches: true });
  render(<RazorpayCheckout cart={cart} disabled={false} live />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Resume secure payment' })).toBeTruthy());
  expect(screen.getByRole('status').textContent).toContain('pending payment (LUV-REMOTE)');
  fireEvent.click(screen.getByRole('button', { name: 'Resume secure payment' }));
  await waitFor(() => expect(open).toHaveBeenCalled());
  expect(createOrder).toHaveBeenCalledWith(expect.objectContaining({ requestKey: 'remote-request' }), true);
});
it('syncs a paid live checkout from another device before another payment can start', async () => {
  recovery.mockResolvedValue({ requestKey: 'remote-paid', status: 'paid', reference: 'LUV-SYNCED', cartMatches: false });
  status.mockResolvedValue({ status: 'paid', reference: 'LUV-SYNCED' });
  render(<RazorpayCheckout cart={cart} disabled={false} live />);
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Order confirmed — LUV-SYNCED'));
  expect(screen.getByRole('heading', { name: 'Thank you! Your order is confirmed.' })).toBeTruthy();
  expect(createOrder).not.toHaveBeenCalled();
});
it('replaces a browser request left behind by a previously blocked attempt with the real server checkout', async () => {
  sessionStorage.setItem(`luvia-checkout-live-${cart.id}`, JSON.stringify({
    request: { fingerprint: 'rejected-browser-request', key: 'not-created-on-server' }, pending: null, verified: false,
  }));
  recovery.mockResolvedValue({ requestKey: 'real-server-request', status: 'link_created', reference: 'LUV-REMOTE', cartMatches: true });
  render(<RazorpayCheckout cart={cart} disabled={false} live />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Resume secure payment' })).toBeTruthy());
  fireEvent.click(screen.getByRole('button', { name: 'Resume secure payment' }));
  await waitFor(() => expect(open).toHaveBeenCalled());
  expect(createOrder).toHaveBeenCalledWith(expect.objectContaining({ requestKey: 'real-server-request' }), true);
});
it('requires provider-checked replacement when a remote checkout no longer matches the cart', async () => {
  recovery.mockResolvedValue({ requestKey: 'remote-old', status: 'link_created', reference: 'LUV-OLD', cartMatches: false });
  status.mockResolvedValue({ status: 'link_created', reference: 'LUV-OLD' });
  render(<RazorpayCheckout cart={cart} disabled={false} live />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Resume secure payment' })).toBeTruthy());
  fireEvent.click(screen.getByRole('button', { name: 'Resume secure payment' }));
  await waitFor(() => expect(open).toHaveBeenCalled());
  expect(createOrder).toHaveBeenCalledWith(expect.objectContaining({ previousRequestKey: 'remote-old' }), true);
  expect(createOrder.mock.calls[0][0].requestKey).not.toBe('remote-old');
});
it('blocks payment on a recovery outage and offers an explicit status retry', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  recovery.mockRejectedValueOnce(new Error('Unable to restore your earlier payment.'));
  render(<RazorpayCheckout cart={cart} disabled={false} live />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Retry payment status check' })).toBeTruthy());
  expect(screen.getByRole('button', { name: 'Proceed to payment' }).hasAttribute('disabled')).toBe(true);
  expect(screen.getByRole('status').textContent).toContain('Unable to restore');
  fireEvent.click(screen.getByRole('button', { name: 'Retry payment status check' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Proceed to payment' }).hasAttribute('disabled')).toBe(false));
  expect(createOrder).not.toHaveBeenCalled();
  log.mockRestore();
});
it('rechecks a paid order on confirmation refresh even after the server clears the cart', async () => {
  sessionStorage.setItem(`luvia-checkout-live-${cart.id}`, JSON.stringify({
    request: { fingerprint: 'purchased-items', key: 'paid-request' }, pending: null, verified: true,
  }));
  status.mockResolvedValue({ status: 'paid', reference: 'LUV-REFRESHED' });
  const confirmed = vi.fn();
  render(<RazorpayCheckout cart={cart} disabled live confirmationOnly onConfirmed={confirmed} />);
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Order confirmed — LUV-REFRESHED'));
  expect(status).toHaveBeenCalledWith('paid-request');
  expect(confirmed).toHaveBeenCalledTimes(1);
  expect(createOrder).not.toHaveBeenCalled();
  expect(purchase).toHaveBeenCalledWith('paid-request');
  expect(screen.queryByRole('button', { name: 'Proceed to payment' })).toBeNull();
});
it('does not claim success or offer payment from a manually opened confirmation URL', () => {
  render(<RazorpayCheckout cart={cart} disabled live confirmationOnly />);
  expect(screen.getByRole('status').textContent).toContain('No saved payment was found');
  expect(purchase).not.toHaveBeenCalled();
  expect(screen.queryByText('Thank you! Your order is confirmed.')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Proceed to payment' })).toBeNull();
  expect(createOrder).not.toHaveBeenCalled();
});
it('uses the authorized confirmation request after the original cart has been removed', async () => {
  status.mockResolvedValue({ status: 'paid', reference: 'LUV-ORIGINAL' });
  render(<RazorpayCheckout cart={cart} disabled live confirmationOnly confirmationRequest="original-request" />);
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Order confirmed — LUV-ORIGINAL'));
  expect(status).toHaveBeenCalledWith('original-request');
  expect(sessionStorage.getItem(`luvia-checkout-live-${cart.id}`)).toBeNull();
  expect(createOrder).not.toHaveBeenCalled();
});
it('does not replace a checkout under review after cart details change', async () => {
  sessionStorage.setItem(`luvia-checkout-live-${cart.id}`, JSON.stringify({
    request: { fingerprint: 'old-cart', key: 'saved-request' }, pending: null, verified: false,
  }));
  status.mockResolvedValue({ status: 'review_required', reference: 'LUV-PENDING' });
  render(<RazorpayCheckout cart={cart} disabled={false} live />);
  await proceed();
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Contact Luvia before another payment'));
  expect(createOrder).not.toHaveBeenCalled();
  expect(JSON.parse(sessionStorage.getItem(`luvia-checkout-live-${cart.id}`)!).request.key).toBe('saved-request');
});
it('syncs a blocked live checkout from another device and prevents another payment', async () => {
  recovery.mockResolvedValue({ requestKey: 'review-request', status: 'review_required', reference: 'LUV-REVIEW', cartMatches: true });
  render(<RazorpayCheckout cart={cart} disabled={false} live />);
  await waitFor(() => expect(screen.getByRole('heading', { name: 'An earlier payment needs checking.' })).toBeTruthy());
  expect(screen.getByRole('status').textContent).toContain('LUV-REVIEW');
  expect(screen.queryByRole('button', { name: 'Proceed to payment' })).toBeNull();
  expect(createOrder).not.toHaveBeenCalled();
});
it('requests a server-checked replacement with the updated cart and retains its key on failure', async () => {
  sessionStorage.setItem(`luvia-checkout-live-${cart.id}`, JSON.stringify({
    request: { fingerprint: 'old-cart', key: 'saved-request' }, pending: null, verified: false,
  }));
  status.mockResolvedValue({ status: 'link_created', reference: 'LUV-PENDING' });
  createOrder.mockRejectedValueOnce(new Error('Provider unavailable.'));
  render(<RazorpayCheckout cart={cart} disabled={false} live />);
  await proceed();
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Provider unavailable'));
  const first = createOrder.mock.calls[0][0];
  expect(first.previousRequestKey).toBe('saved-request');
  expect(first.requestKey).not.toBe('saved-request');
  expect(JSON.parse(sessionStorage.getItem(`luvia-checkout-live-${cart.id}`)!).request.previousRequestKey).toBe('saved-request');
  await proceed();
  await waitFor(() => expect(open).toHaveBeenCalled());
  expect(createOrder.mock.calls[1][0]).toEqual(first);
});
it('renews an expired checkout even when cart details have not changed', async () => {
  render(<RazorpayCheckout cart={cart} disabled={false} live />);
  await proceed();
  await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
  const original = createOrder.mock.calls[0][0].requestKey;
  options.modal.ondismiss();
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('closed'));
  status.mockResolvedValue({ status: 'expired', reference: 'LUV-EXPIRED' });
  fireEvent.click(screen.getByRole('button', { name: 'Resume secure payment' }));
  await waitFor(() => expect(open).toHaveBeenCalledTimes(2));
  expect(createOrder.mock.calls[1][0].previousRequestKey).toBe(original);
  expect(createOrder.mock.calls[1][0].requestKey).not.toBe(original);
});
it.each(['closed', 'failed'] as const)('prominently recovers a %s live payment without replacing the checkout', async interruption => {
  render(<RazorpayCheckout cart={cart} disabled={false} live />);
  await proceed();
  await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
  const originalKey = createOrder.mock.calls[0][0].requestKey;
  if (interruption === 'failed') {
    failed({ error: { description: 'Card declined' } });
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Card declined'));
    expect(screen.getByRole('button', { name: 'Payment in progress…' }).hasAttribute('disabled')).toBe(true);
  }
  options.modal.ondismiss();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Resume secure payment' })).toBeTruthy());
  expect(screen.getByRole('heading', { name: interruption === 'failed'
    ? "Payment didn't go through. Let's get you back on track." : 'Not ready just yet? Your cart is waiting.' })).toBeTruthy();
  expect(screen.getByRole('status').textContent).toContain('If money was debited');
  expect(screen.getByText('Payment incomplete')).toBeTruthy();
  expect(screen.getByText('Your handmade favourites are one step away. Complete your payment to make them yours.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Resume secure payment' }).className).toContain('bg-mustard');
  expect(screen.getByRole('link', { name: 'Get payment help on WhatsApp' }).getAttribute('href')).toContain('https://wa.me/');
  fireEvent.click(screen.getByRole('button', { name: 'Resume secure payment' }));
  await waitFor(() => expect(open).toHaveBeenCalledTimes(2));
  expect(createOrder.mock.calls[1][0].requestKey).toBe(originalKey);
  expect(screen.queryByRole('button', { name: 'Resume secure payment' })).toBeNull();
});

it('never offers resume payment when a failed attempt later needs verification', async () => {
  verify.mockRejectedValue(new Error('Retry verification; do not pay again.'));
  render(<RazorpayCheckout cart={cart} disabled={false} live />);
  await proceed();
  await waitFor(() => expect(open).toHaveBeenCalled());
  failed({ error: { description: 'Card declined' } });
  options.handler({ razorpay_order_id: 'order_test', razorpay_payment_id: 'pay_test', razorpay_signature: 'signature' });
  options.modal.ondismiss();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Retry payment verification' })).toBeTruthy());
  expect(screen.queryByRole('button', { name: 'Resume secure payment' })).toBeNull();
  expect(screen.queryByText(/Let's get you back on track/)).toBeNull();
});
it('verifies all response fields and never reports a real purchase', async () => {
  render(<RazorpayCheckout cart={cart} disabled={false} />);
  await start();
  const response = { razorpay_order_id: 'order_test', razorpay_payment_id: 'pay_test', razorpay_signature: 'signature' };
  options.handler(response);
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Test payment verified'));
  expect(verify).toHaveBeenCalledWith(response);
  expect(screen.getByRole('status').textContent).toContain('no order was placed');
  expect(screen.queryByRole('button', { name: 'Try Razorpay test checkout' })).toBeNull();
});
it('persists a failed verification across remounts and offers verification, not another payment', async () => {
  verify.mockRejectedValue(new Error('Retry verification; do not pay again.'));
  const first = render(<RazorpayCheckout cart={cart} disabled={false} />);
  await start();
  options.handler({ razorpay_order_id: 'order_test', razorpay_payment_id: 'pay_test', razorpay_signature: 'signature' });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Retry payment verification' })).toBeTruthy());
  options.modal.ondismiss();
  first.unmount();
  render(<RazorpayCheckout cart={cart} disabled={false} />);
  expect(screen.queryByRole('button', { name: 'Try Razorpay test checkout' })).toBeNull();
  verify.mockResolvedValue('pay_test');
  fireEvent.click(screen.getByRole('button', { name: 'Retry payment verification' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Test payment verified'));
  expect(createOrder).toHaveBeenCalledTimes(1);
});
it('surfaces script and API failures and keeps blocked carts disabled', async () => {
  load.mockRejectedValue(new Error('Unable to load Razorpay.'));
  const first = render(<RazorpayCheckout cart={cart} disabled={false} />);
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Test Buyer' } });
  fireEvent.change(screen.getByLabelText('Indian mobile number'), { target: { value: '9876543210' } });
  fireEvent.click(screen.getByRole('button', { name: 'Try Razorpay test checkout' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Unable to load'));
  expect(createOrder).not.toHaveBeenCalled();
  first.unmount();
  render(<RazorpayCheckout cart={cart} disabled />);
  expect(screen.getByRole('button', { name: 'Try Razorpay test checkout' }).hasAttribute('disabled')).toBe(true);
});

it.each([
  'This cart has a pending payment. Resume it or contact Luvia before paying again.',
  'Previous checkout needs verification. Contact Luvia; do not pay again.',
  'A payment was attempted on the earlier checkout. Verify it before another payment; contact Luvia.',
])('replaces unsafe payment retries with prominent support for: %s', async message => {
  createOrder.mockRejectedValueOnce(new Error(message));
  render(<RazorpayCheckout cart={cart} disabled={false} live />);
  await proceed();
  await waitFor(() => expect(screen.getByRole('heading', { name: 'An earlier payment needs checking.' })).toBeTruthy());
  expect(screen.getByRole('status').textContent).toContain(message);
  expect(screen.getByRole('status').textContent).toContain('We cannot safely start another payment');
  expect(screen.queryByRole('button', { name: 'Proceed to payment' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Resume secure payment' })).toBeNull();
  expect(screen.getByRole('link', { name: 'Get payment help on WhatsApp' })).toBeTruthy();
  expect(screen.queryByText(/Complete your payment to make them yours/)).toBeNull();
  expect(open).not.toHaveBeenCalled();
});
