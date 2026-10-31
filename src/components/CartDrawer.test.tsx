import { cleanup, render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import CartDrawer from './CartDrawer';
import type { Cart } from '../types/cart';
import { getCartTotals, getFreeDeliveryShortfall } from '../utils/cartMessage';
import { fetchWelcomeOffer } from '../services/customer';
import { fetchLiveCheckoutEnabled } from '../services/checkout';
vi.mock('../services/customer', () => ({ fetchWelcomeOffer: vi.fn() }));

vi.mock('../services/checkout', () => ({ fetchLiveCheckoutEnabled: vi.fn().mockResolvedValue(false) }));
vi.mock('./RazorpayCheckout', () => ({
  default: ({ cart, live, onConfirmed }: { cart: Cart; live?: boolean; onConfirmed?: (request: string, cart: Cart) => void }) =>
    live ? <button onClick={() => onConfirmed?.('verified-request', cart)}>Simulate verified payment</button> : null,
}));
const cart: Cart = {
  id: 'cart', reference: 'CRT-TEST', status: 'active', updatedAt: '', expiresAt: '', whatsappStartedAt: null,
  items: [{ id: 'item', productId: 'product', variantId: 'variant', productName: 'Flower', variantName: '',
    image: '', quantity: 1, unitPrice: 499 }],
};
afterEach(cleanup);

it('does not show assisted ordering while checkout settings are loading or failed, and supports retry', async () => {
  let rejectSettings!: (reason: Error) => void;
  vi.mocked(fetchLiveCheckoutEnabled).mockReturnValueOnce(new Promise((_, reject) => { rejectSettings = reject; }));
  render(<CartDrawer cart={cart} pageStep="review" products={[]} isLoading={false} isBusy={false} error={null}
    onClose={vi.fn()} onUpdateQuantity={vi.fn()} onRemove={vi.fn()} onClear={vi.fn()}
    onWhatsAppStarted={vi.fn()} onEmailStarted={vi.fn()} onOpenProduct={vi.fn()} onSaveDeliveryPin={vi.fn()} />);
  expect(screen.getByRole('status').textContent).toContain('Loading checkout options');
  expect(screen.queryByLabelText('Send cart to Luvia on WhatsApp')).toBeNull();
  await act(async () => { rejectSettings(new Error('Checkout options are unavailable.')); });
  expect(screen.getByRole('alert').textContent).toContain('Checkout options are unavailable');
  expect(screen.queryByLabelText('Send cart to Luvia on WhatsApp')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Retry checkout options' }));
  expect(await screen.findByLabelText('Send cart to Luvia on WhatsApp')).toBeTruthy();
});

it('does not offer assisted-order submission before the review step', async () => {
  renderCart(cart);
  expect(screen.getByText(/Online checkout currently supports delivery within India/)).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Request an international quote' }).getAttribute('href')).toMatch(/^https:\/\/wa.me\//);
  await waitFor(() => expect(screen.queryByText('Loading checkout options…')).toBeNull());
  expect(screen.queryByRole('link', { name: 'Send cart to Luvia on WhatsApp' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Continue with delivery details' })).toBeTruthy();
});

it('immediately replaces the editable cart with confirmation and refreshes server cart after verified payment', async () => {
  vi.mocked(fetchLiveCheckoutEnabled).mockResolvedValueOnce(true);
  const navigate = vi.fn();
  const refresh = vi.fn();
  render(<CartDrawer cart={cart} pageStep="review" products={[]} isLoading={false} isBusy={false} error={null}
    onClose={vi.fn()} onUpdateQuantity={vi.fn()} onRemove={vi.fn()} onClear={vi.fn()}
    onWhatsAppStarted={vi.fn()} onEmailStarted={vi.fn()} onOpenProduct={vi.fn()} onSaveDeliveryPin={vi.fn()}
    onNavigateStep={navigate} onPaymentConfirmed={refresh} />);
  const confirm = await screen.findByRole('button', { name: 'Simulate verified payment' });
  expect(refresh).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Remove Flower from cart' })).toBeTruthy();
  await act(async () => { fireEvent.click(confirm); });
  expect(screen.getByRole('heading', { name: 'Order confirmation' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Remove Flower from cart' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Continue shopping' })).toBeTruthy();
  expect(navigate).toHaveBeenCalledExactlyOnceWith('confirmation', 'verified-request');
  expect(refresh).toHaveBeenCalledTimes(1);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Simulate verified payment' })); });
  expect(refresh).toHaveBeenCalledTimes(1);
});
const renderCart = (value: Cart, onClose = vi.fn(), onCreateAccount?: () => void, accountName?: string) => render(<CartDrawer cart={value} pageStep="cart" products={[]}
  onCreateAccount={onCreateAccount} accountName={accountName}
  isLoading={false} isBusy={false} error={null} onClose={onClose} onUpdateQuantity={vi.fn()}
  onRemove={vi.fn()} onClear={vi.fn()} onWhatsAppStarted={vi.fn()} onEmailStarted={vi.fn()}
  onOpenProduct={vi.fn()} onSaveDeliveryPin={vi.fn()} />);

it.each([499, 500, 501])('uses the exact free-delivery threshold for items worth %s', subtotal => {
  renderCart({ ...cart, items: [{ ...cart.items[0], unitPrice: subtotal }] });
  const banner = screen.getByRole('region', { name: 'Free delivery' });
  expect(banner.textContent).toContain(subtotal < 500 ? 'Add ₹1 more in items for free delivery!' : "You've unlocked free delivery!");
  if (subtotal < 500) {
    expect(screen.getByRole('progressbar', { name: 'Progress towards free shipping' }).getAttribute('aria-valuenow')).toBe(String(subtotal));
  } else {
    expect(screen.queryByRole('progressbar', { name: 'Progress towards free shipping' })).toBeNull();
  }
  expect(screen.queryByLabelText('Delivery pincode (optional)')).toBeNull();
  expect(screen.queryByText(/^Delivery pincode:/)).toBeNull();
});
it('expands the cart price breakdown by default', () => {
  renderCart(cart);
  expect(screen.getByText('Price breakdown', { exact: true }).closest('details')?.open).toBe(true);
  expect(screen.getByText('Items subtotal')).toBeTruthy();
  expect(screen.getByLabelText('Checkout total').textContent).toContain(`Estimated total: ₹${getCartTotals(cart).total.toLocaleString('en-IN')}`);
  expect(screen.getByLabelText('Checkout total').closest('div')?.querySelector('h2')?.textContent).toBe('Your cart');
});
it('links the empty cart directly to homepage products', () => {
  renderCart({ ...cart, items: [] });
  expect(screen.getByText('Your cart is empty')).toBeTruthy();
  expect(screen.queryByLabelText('Cart order actions')).toBeNull();
  expect(screen.queryByLabelText('Checkout total')).toBeNull();
  expect(screen.queryByRole('region', { name: 'Free delivery' })).toBeNull();
  expect(screen.getByRole('link', { name: 'Shop now' }).getAttribute('href'))
    .toBe(`${import.meta.env.BASE_URL}#products`);
});
it('excludes shipping fees and applies coupon discounts to the free-delivery prompt', () => {
  const close = vi.fn();
  renderCart({ ...cart, items: [{ ...cart.items[0], unitPrice: 500 }],
    coupon: { code: 'SAVE', percent: 10, maxDiscountRupees: 100, minimumSubtotalRupees: 500 } }, close);
  expect(screen.getByRole('region', { name: 'Free delivery' }).textContent).toContain('Add ₹55 more in items');
  expect(screen.getByRole('progressbar', { name: 'Progress towards free shipping' }).getAttribute('aria-valuetext'))
    .toBe('₹450 of ₹500 after coupon discounts');
  fireEvent.click(screen.getByRole('button', { name: 'Add more items' }));
  expect(close).toHaveBeenCalledTimes(1);
});
it('does not claim free-delivery eligibility for unpriced items', () => {
  renderCart({ ...cart, items: [{ ...cart.items[0], unitPrice: null }] });
  expect(screen.queryByRole('region', { name: 'Free delivery' })).toBeNull();
});
it('also shows the coupon-aware free-delivery message in the cart drawer', () => {
  render(<CartDrawer cart={{ ...cart, items: [{ ...cart.items[0], unitPrice: 500 }],
    coupon: { code: 'SAVE', percent: 10, maxDiscountRupees: 100, minimumSubtotalRupees: 500 } }}
    products={[]} isLoading={false} isBusy={false} error={null} onClose={vi.fn()} onUpdateQuantity={vi.fn()}
    onRemove={vi.fn()} onClear={vi.fn()} onWhatsAppStarted={vi.fn()} onEmailStarted={vi.fn()}
    onOpenProduct={vi.fn()} onSaveDeliveryPin={vi.fn()} />);
  expect(screen.getByRole('region', { name: 'Free delivery' }).textContent).toContain('Add ₹55 more in items');
});
it('shows the configured guest welcome discount and opens signup without closing checkout', async () => {
  vi.mocked(fetchWelcomeOffer).mockResolvedValue({ enabled: true, percent: 15, maxDiscountRupees: 80,
    minimumSubtotalRupees: 600, validDays: 7 });
  const signup = vi.fn();
  const close = vi.fn();
  renderCart(cart, close, signup);
  const banner = await screen.findByRole('region', { name: 'Welcome discount' });
  expect(banner.textContent).toContain('15% off your first order');
  expect(banner.textContent).not.toContain('additional');
  expect(banner.textContent).toContain('₹80');
  expect(banner.textContent).toContain('₹600');
  expect(banner.textContent).toContain('7 days');
  expect(banner.textContent).toContain('Guest checkout remains available');
  fireEvent.click(screen.getByRole('button', { name: 'Create account & save' }));
  expect(signup).toHaveBeenCalledTimes(1);
  expect(close).not.toHaveBeenCalled();
});
it('does not advertise a disabled welcome offer', async () => {
  vi.mocked(fetchWelcomeOffer).mockResolvedValue({ enabled: false, percent: 15, maxDiscountRupees: 80,
    minimumSubtotalRupees: 600, validDays: 7 });
  renderCart(cart, vi.fn(), vi.fn());
  await act(async () => { await vi.mocked(fetchWelcomeOffer).mock.results.at(-1)?.value; });
  expect(screen.queryByRole('region', { name: 'Welcome discount' })).toBeNull();
});
it('does not show the guest signup banner to a signed-in customer', () => {
  renderCart(cart, vi.fn(), vi.fn(), 'Asha');
  expect(screen.queryByRole('region', { name: 'Welcome discount' })).toBeNull();
});
it('reports offer loading errors without advertising an unconfirmed discount', async () => {
  vi.mocked(fetchWelcomeOffer).mockRejectedValue(new Error('Unable to load welcome discount.'));
  renderCart(cart, vi.fn(), vi.fn());
  expect((await screen.findByRole('alert')).textContent).toContain('Unable to load welcome discount.');
  expect(screen.queryByRole('region', { name: 'Welcome discount' })).toBeNull();
});
it.each([
  [499, 500, 10, 100, 56],
  [500, 500, 10, 100, 55],
  [450, 600, 50, 200, 50],
  [600, 600, 50, 200, 100],
])('suggests enough additional items with subtotal %s and coupon minimum %s', (subtotal, minimumSubtotalRupees, percent, maxDiscountRupees, expected) => {
  const value = { ...cart, items: [{ ...cart.items[0], unitPrice: subtotal }],
    coupon: { code: 'SAVE', percent, maxDiscountRupees, minimumSubtotalRupees } };
  expect(getFreeDeliveryShortfall(value)).toBe(expected);
  const updated = { ...value, items: [{ ...value.items[0], unitPrice: subtotal + expected }] };
  expect(getCartTotals(updated).shipping).toBe(0);
  expect(getCartTotals({ ...updated, items: [{ ...updated.items[0], unitPrice: subtotal + expected - 1 }] }).shipping).toBeGreaterThan(0);
});
