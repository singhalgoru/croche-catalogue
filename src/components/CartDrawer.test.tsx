import { cleanup, render, screen, fireEvent, act } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import CartDrawer from './CartDrawer';
import type { Cart } from '../types/cart';
import { getCartTotals, getFreeDeliveryShortfall } from '../utils/cartMessage';
import { fetchWelcomeOffer } from '../services/customer';
import { fetchLiveCheckoutEnabled } from '../services/checkout';
vi.mock('../services/customer', () => ({ fetchWelcomeOffer: vi.fn() }));

vi.mock('../services/checkout', () => ({ fetchLiveCheckoutEnabled: vi.fn().mockResolvedValue(false) }));
vi.mock('./RazorpayCheckout', () => ({
  default: ({ cart, onConfirmed }: { cart: Cart; onConfirmed: (request: string, cart: Cart) => void }) =>
    <button onClick={() => onConfirmed('verified-request', cart)}>Simulate verified payment</button>,
}));
const cart: Cart = {
  id: 'cart', reference: 'CRT-TEST', status: 'active', updatedAt: '', expiresAt: '', whatsappStartedAt: null,
  items: [{ id: 'item', productId: 'product', variantId: 'variant', productName: 'Flower', variantName: '',
    image: '', quantity: 1, unitPrice: 499 }],
};
afterEach(cleanup);

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
  fireEvent.click(confirm);
  expect(screen.getByRole('heading', { name: 'Order confirmation' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Remove Flower from cart' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Continue shopping' })).toBeTruthy();
  expect(navigate).toHaveBeenCalledExactlyOnceWith('confirmation', 'verified-request');
  expect(refresh).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Simulate verified payment' }));
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
});
it('links the empty cart directly to homepage products', () => {
  renderCart({ ...cart, items: [] });
  expect(screen.getByText('Your cart is empty')).toBeTruthy();
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
  expect(banner.textContent).toContain('additional 15% off your first order');
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
