import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import CartDeliveryPin from './CartDeliveryPin';
import type { Cart } from '../types/cart';

const cart: Cart = { id: 'c1', reference: 'CRT-1', status: 'active', updatedAt: '', expiresAt: '', whatsappStartedAt: null, items: [] };
afterEach(cleanup);

it('requires a valid PIN or blank, saves explicitly and allows clearing', async () => {
  const onSave = vi.fn(async (pin: string) => ({ ...cart, deliveryPinCode: pin || null }));
  const { rerender } = render(<CartDeliveryPin cart={cart} busy={false} onSave={onSave} />);
  const input = screen.getByLabelText('Delivery pincode (optional)');
  fireEvent.change(input, { target: { value: '000000' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(screen.getByRole('alert').textContent).toContain('6-digit');
  expect(onSave).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: '110001' } });
  expect(onSave).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('saved'));
  rerender(<CartDeliveryPin cart={{ ...cart, deliveryPinCode: '110001' }} busy={false} onSave={onSave} />);
  fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('cleared'));
  expect(onSave).toHaveBeenLastCalledWith('');
});

it('surfaces save failures and preserves the draft for retry', async () => {
  render(<CartDeliveryPin cart={cart} busy={false} onSave={vi.fn().mockResolvedValue(null)} />);
  fireEvent.change(screen.getByLabelText('Delivery pincode (optional)'), { target: { value: '110001' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('retry'));
  expect((screen.getByLabelText('Delivery pincode (optional)') as HTMLInputElement).value).toBe('110001');
});

it('keeps saved PINs compact with change, cancel and expandable disclosure', () => {
  const savedCart = { ...cart, deliveryPinCode: '110001',
    deliveryPinLocation: { districts: ['Central Delhi'], states: ['Delhi'], country: 'India' as const } };
  const onSave = vi.fn();
  render(<CartDeliveryPin cart={savedCart} busy={false} onSave={onSave} />);
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(screen.getByText('Delivery pincode: 110001')).toBeTruthy();
  const disclosure = screen.getByText('How we use your pincode').closest('details')!;
  expect(disclosure.open).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Change' }));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '999999' } });
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(onSave).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Change' }));
  expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('110001');
});
