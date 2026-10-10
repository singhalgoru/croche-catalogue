import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import RazorpayCheckout from './RazorpayCheckout';
import type { Cart } from '../types/cart';
import type { CheckoutOptions } from '../services/checkout';
const { createOrder, verify, load, status } = vi.hoisted(() => ({
  createOrder: vi.fn(), verify: vi.fn(), load: vi.fn(), status: vi.fn(),
}));
vi.mock('../services/checkout', async importOriginal => ({
  ...await importOriginal<typeof import('../services/checkout')>(),
  createCheckoutOrder: createOrder, verifyCheckoutPayment: verify, loadRazorpay: load,
  fetchLiveCheckoutStatus: status,
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
});
it('uses saved delivery details and confirms a real order only after backend verification', async () => {
  createOrder.mockResolvedValue({ order_id: 'order_live', amount: 55000, currency: 'INR',
    key_id: 'rzp_live_fixture', test_mode: false, reference: 'LUV-LIVE' });
  verify.mockResolvedValue('LUV-LIVE');
  render(<RazorpayCheckout cart={{ ...cart, deliveryDetails: { name: 'Buyer', phone: '9876543210',
    email: 'buyer@example.test', addressLine1: '12 Test Street', addressLine2: '', city: 'Delhi', state: 'Delhi', pincode: '110001' } }}
    disabled={false} live />);
  expect(screen.queryByLabelText('Name')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Pay securely with Razorpay' }));
  await waitFor(() => expect(open).toHaveBeenCalled());
  expect(options.description).toBe('Order LUV-LIVE');
  expect(options.prefill).toEqual({ name: 'Buyer', contact: '+919876543210' });
  const response = { razorpay_order_id: 'order_live', razorpay_payment_id: 'pay_live', razorpay_signature: 'fixture' };
  options.handler(response);
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Order confirmed — LUV-LIVE'));
  expect(verify).toHaveBeenCalledWith(response, true);
  expect(screen.queryByRole('button', { name: 'Pay securely with Razorpay' })).toBeNull();
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
  expect(status).toHaveBeenCalledWith('saved-request');
  expect(createOrder).not.toHaveBeenCalled();
  expect(verify).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Pay securely with Razorpay' })).toBeNull();
});
it('does not replace a pending checkout after cart details change', async () => {
  sessionStorage.setItem(`luvia-checkout-live-${cart.id}`, JSON.stringify({
    request: { fingerprint: 'old-cart', key: 'saved-request' }, pending: null, verified: false,
  }));
  status.mockResolvedValue({ status: 'link_created', reference: 'LUV-PENDING' });
  render(<RazorpayCheckout cart={cart} disabled={false} live />);
  fireEvent.click(screen.getByRole('button', { name: 'Pay securely with Razorpay' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Contact Luvia before another payment'));
  expect(createOrder).not.toHaveBeenCalled();
  expect(JSON.parse(sessionStorage.getItem(`luvia-checkout-live-${cart.id}`)!).request.key).toBe('saved-request');
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
