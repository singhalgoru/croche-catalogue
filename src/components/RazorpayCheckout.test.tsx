import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import RazorpayCheckout from './RazorpayCheckout';
import type { Cart } from '../types/cart';
import type { CheckoutOptions } from '../services/checkout';
const { createOrder, verify, load } = vi.hoisted(() => ({
  createOrder: vi.fn(), verify: vi.fn(), load: vi.fn(),
}));
vi.mock('../services/checkout', async importOriginal => ({
  ...await importOriginal<typeof import('../services/checkout')>(),
  createCheckoutOrder: createOrder, verifyCheckoutPayment: verify, loadRazorpay: load,
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
