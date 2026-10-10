import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { fetchCart } from '../../services/cart';
import AdminTestCheckout from './AdminTestCheckout';
import type { Cart } from '../../types/cart';

const cart: Cart = {
  id: 'cart', reference: 'CRT-TEST', status: 'active', updatedAt: '', expiresAt: '',
  whatsappStartedAt: null, items: [],
};

vi.mock('../../services/cart', () => ({ fetchCart: vi.fn() }));
vi.mock('../RazorpayCheckout', () => ({
  default: () => <div>Test checkout form</div>,
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it('loads only on explicit request and reports an empty cart', async () => {
  vi.mocked(fetchCart).mockResolvedValue(cart);
  render(<AdminTestCheckout />);
  expect(fetchCart).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Load my cart for test payment' }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('Your cart is empty'));
  expect(screen.queryByText('Test checkout form')).toBeNull();
});

it('shows the existing checkout for the owned cart', async () => {
  vi.mocked(fetchCart).mockResolvedValue({
    ...cart, items: [{ id: 'item', productId: 'product', variantId: 'variant',
      productName: 'Product', variantName: '', image: '', unitPrice: 100, quantity: 1 }],
  });
  render(<AdminTestCheckout />);
  fireEvent.click(screen.getByRole('button', { name: 'Load my cart for test payment' }));
  expect(await screen.findByText('Test checkout form')).toBeTruthy();
});

it('surfaces cart loading failures', async () => {
  vi.mocked(fetchCart).mockRejectedValue(new Error('Session expired.'));
  render(<AdminTestCheckout />);
  fireEvent.click(screen.getByRole('button', { name: 'Load my cart for test payment' }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Session expired.');
});
