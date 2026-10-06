import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import CartDeliveryPin from './CartDeliveryPin';
import type { Cart } from '../types/cart';

const cart: Cart = { id: 'c1', reference: 'CRT-1', status: 'active', updatedAt: '', expiresAt: '', whatsappStartedAt: null, items: [] };
afterEach(cleanup);

it('requires a valid PIN or blank, saves explicitly and allows clearing', async () => {
  const onSave = vi.fn(async (pin: string) => ({ ...cart, deliveryPinCode: pin || null }));
  const { rerender } = render(<CartDeliveryPin cart={cart} busy={false} onSave={onSave} />);
  const input = screen.getByLabelText('Delivery PIN code (optional)');
  fireEvent.change(input, { target: { value: '000000' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save PIN' }));
  expect(screen.getByRole('alert').textContent).toContain('6-digit');
  expect(onSave).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: '110001' } });
  expect(onSave).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Save PIN' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('saved'));
  rerender(<CartDeliveryPin cart={{ ...cart, deliveryPinCode: '110001' }} busy={false} onSave={onSave} />);
  fireEvent.click(screen.getByRole('button', { name: 'Clear PIN' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('cleared'));
  expect(onSave).toHaveBeenLastCalledWith('');
});

it('surfaces save failures and preserves the draft for retry', async () => {
  render(<CartDeliveryPin cart={cart} busy={false} onSave={vi.fn().mockResolvedValue(null)} />);
  fireEvent.change(screen.getByLabelText('Delivery PIN code (optional)'), { target: { value: '110001' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save PIN' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('retry'));
  expect((screen.getByLabelText('Delivery PIN code (optional)') as HTMLInputElement).value).toBe('110001');
});
