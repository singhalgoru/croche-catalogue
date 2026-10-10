import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import CustomerOrders from './CustomerOrders';
import { fetchCustomerOrders } from '../services/customer';
import type { CustomerOrder } from '../types/customer';

vi.mock('../services/customer', () => ({ fetchCustomerOrders: vi.fn() }));
const order: CustomerOrder = {
  id: 'order-1', reference: 'LUV-ORDER1', status: 'paid', createdAt: '2026-10-10T12:00:00Z',
  paidAt: '2026-10-10T12:10:00Z', customerName: 'Buyer', deliveryPincode: '110001',
  subtotal: 500, discount: 50, shipping: 100, total: 550,
  items: [{ id: 'item', productName: 'Rose Charm', variantName: 'Pink', quantity: 2, unitPrice: 250, lineTotal: 500 }],
};
beforeEach(() => { vi.mocked(fetchCustomerOrders).mockReset().mockResolvedValue([]); });
afterEach(cleanup);
it('shows the empty state without claiming an enquiry is an order', async () => {
  render(<CustomerOrders />);
  expect(await screen.findByText('No orders yet.')).toBeTruthy();
  expect(screen.getByText(/WhatsApp\/email enquiries are not confirmed orders/)).toBeTruthy();
});
it('shows saved order details and refreshes the current payment status', async () => {
  vi.mocked(fetchCustomerOrders).mockResolvedValue([order]);
  render(<CustomerOrders />);
  expect(await screen.findByText('Payment received')).toBeTruthy();
  expect(screen.getByRole('article', { name: 'Order LUV-ORDER1' })).toBeTruthy();
  expect(screen.getByText('Rose Charm (Pink)')).toBeTruthy();
  expect(screen.getByText('₹550')).toBeTruthy();
  expect(screen.getByText('-₹50')).toBeTruthy();
  expect(screen.getByText(/Pincode: 110001/)).toBeTruthy();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh orders' }).hasAttribute('disabled')).toBe(false));
  vi.mocked(fetchCustomerOrders).mockResolvedValue([{ ...order, status: 'review_required', paidAt: null }]);
  fireEvent.click(screen.getByRole('button', { name: 'Refresh orders' }));
  expect(await screen.findByText('Payment under review')).toBeTruthy();
});
it('reports load failures and allows retry', async () => {
  vi.mocked(fetchCustomerOrders).mockRejectedValueOnce(new Error('Connection unavailable.'));
  render(<CustomerOrders />);
  expect((await screen.findByRole('alert')).textContent).toBe('Connection unavailable.');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh orders' }).hasAttribute('disabled')).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: 'Refresh orders' }));
  expect(await screen.findByText('No orders yet.')).toBeTruthy();
});
it('loads the next page without removing previous orders', async () => {
  vi.mocked(fetchCustomerOrders).mockResolvedValueOnce(Array.from({ length: 20 }, (_, i) => ({
    ...order, id: `order-${i}`, reference: `LUV-${i}`,
  }))).mockResolvedValueOnce([{ ...order, id: 'next', reference: 'LUV-NEXT' }]);
  render(<CustomerOrders />);
  fireEvent.click(await screen.findByRole('button', { name: 'Load more orders' }));
  expect(await screen.findByRole('article', { name: 'Order LUV-NEXT' })).toBeTruthy();
  expect(screen.getAllByRole('article')).toHaveLength(21);
  expect(fetchCustomerOrders).toHaveBeenLastCalledWith(20);
});
