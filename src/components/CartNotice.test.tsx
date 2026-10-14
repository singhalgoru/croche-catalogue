import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import CartNotice from './CartNotice';

afterEach(cleanup);

it.each([['1', 'piece'], ['5', 'pieces']])('shows a branded stock notice for %s available', (quantity, unit) => {
  const dismiss = vi.fn();
  render(<CartNotice message={`Unable to add this product to your cart: Only ${quantity} available for Lotus Flower Decor. Please reduce the quantity or remove this item.`} onDismiss={dismiss} />);
  expect(screen.getByRole('alert').className).toContain('bg-cream');
  expect(screen.getByText('Available quantity')).toBeTruthy();
  expect(screen.getByText(`We currently have ${quantity} ${unit} of Lotus Flower Decor available. Your cart has not changed.`)).toBeTruthy();
  expect(screen.queryByText(/Unable to add/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss cart error' }));
  expect(dismiss).toHaveBeenCalledOnce();
});

it('shows an unavailable message rather than encouraging another attempt when stock is zero', () => {
  render(<CartNotice message="Unable to update the cart quantity: Only 0 available for Rose. Please reduce the quantity or remove this item." />);
  expect(screen.getByText('Currently unavailable')).toBeTruthy();
  expect(screen.getByText(/Please remove it from your cart/)).toBeTruthy();
});

it('preserves unexpected errors without disguising them as stock notices', () => {
  render(<CartNotice message="Unable to update your cart: Connection failed." />);
  expect(screen.getByRole('alert').className).toContain('bg-red-50');
  expect(screen.getByText('Unable to update your cart: Connection failed.')).toBeTruthy();
});
