import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import CustomerOrders from './CustomerOrders';
import { fetchCustomerOrders, hideCancelledLiveOrder, updateOrderFulfilment, setCustomerOrderHidden } from '../services/customer';
import type { CustomerOrder } from '../types/customer';

vi.mock('../services/customer', () => ({ fetchCustomerOrders: vi.fn(), hideCancelledLiveOrder: vi.fn(), updateOrderFulfilment: vi.fn(), setCustomerOrderHidden: vi.fn() }));
const order: CustomerOrder = {
  id: 'order-1', reference: 'LUV-ORDER1', status: 'paid', createdAt: '2026-10-10T12:00:00Z',
  paidAt: '2026-10-10T12:10:00Z', customerName: 'Buyer', deliveryPincode: '110001',
  subtotal: 500, discount: 50, shipping: 100, total: 550,
  items: [{ id: 'item', productName: 'Rose Charm', variantName: 'Pink', quantity: 2, unitPrice: 250, lineTotal: 500 }],
};
beforeEach(() => {
  vi.mocked(fetchCustomerOrders).mockReset().mockResolvedValue([]);
  vi.mocked(hideCancelledLiveOrder).mockReset().mockResolvedValue();
  vi.mocked(updateOrderFulfilment).mockReset();
  vi.mocked(setCustomerOrderHidden).mockReset().mockResolvedValue();
});
it('shows the booked courier estimate to customers and replaces transit days with tracking ETA',async () => {
  const fulfilment = { status: 'processing' as const,courierName: '',trackingNumber: '',trackingUrl: '',updatedAt: null,
    deliveryEstimate: { courierName: 'Shadowfax Surface',transitDays: 4,expectedDate: null,updatedAt: null } };
  vi.mocked(fetchCustomerOrders).mockResolvedValue([{ ...order,fulfilment }]);
  render(<CustomerOrders />);
  expect(await screen.findByText('Estimated transit: about 4 days after courier pickup.')).toBeTruthy();
  vi.mocked(fetchCustomerOrders).mockResolvedValue([{ ...order,fulfilment: {
    ...fulfilment,deliveryEstimate: { ...fulfilment.deliveryEstimate,expectedDate: '2026-10-25' },
  } }]);
  fireEvent.click(screen.getByRole('button',{ name: 'Refresh orders' }));
  expect(await screen.findByText("Courier's expected delivery: 25 Oct 2026")).toBeTruthy();
  expect(screen.queryByText(/Estimated transit:/)).toBeNull();
});
it('puts current paid orders ahead of newer failed and delivered orders', async () => {
  vi.mocked(fetchCustomerOrders).mockResolvedValue([
    { ...order, id: 'failed', reference: 'FAILED', status: 'link_failed', paidAt: null, createdAt: '2026-10-11T12:00:00Z' },
    { ...order, id: 'delivered', reference: 'DELIVERED', fulfilment: { status: 'delivered', courierName: '', trackingNumber: '', trackingUrl: '', updatedAt: null } },
    { ...order, reference: 'ACTIVE', createdAt: '2026-10-01T12:00:00Z' },
  ]);
  render(<CustomerOrders />);
  await screen.findByRole('article', { name: 'Order ACTIVE' });
  expect(screen.getAllByRole('article')[0].getAttribute('aria-label')).toBe('Order ACTIVE');
});
it.each(['paid', 'cancelled', 'expired', 'link_failed'] as const)('reorders %s orders and reports skipped products', async status => {
  vi.mocked(fetchCustomerOrders).mockResolvedValue([{ ...order, status }]);
  const reorder = vi.fn().mockResolvedValue({ added: 1, skipped: [{ productName: 'Old product', variantName: 'Pink', reason: 'No longer available' }] });
  const openCart = vi.fn();
  render(<CustomerOrders onReorder={reorder} onOpenCart={openCart} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Reorder LUV-ORDER1' }));
  expect(await screen.findByText(/1 order item added to your cart at current prices/)).toBeTruthy();
  expect(screen.getByText(/Old product.*No longer available/)).toBeTruthy();
  expect(reorder).toHaveBeenCalledWith(order.id);
  fireEvent.click(screen.getByRole('button', { name: 'View cart' }));
  expect(openCart).toHaveBeenCalledOnce();
});
it('reports reorder failure without claiming products were added', async () => {
  vi.mocked(fetchCustomerOrders).mockResolvedValue([order]);
  render(<CustomerOrders onReorder={vi.fn().mockRejectedValue(new Error('Payment under review.'))} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Reorder LUV-ORDER1' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Payment under review.');
  expect(screen.queryByText(/added to your cart at current prices/)).toBeNull();
});
it.each(['cancelled', 'expired'] as const)('hides and restores %s orders without deleting them', async status => {
  vi.mocked(fetchCustomerOrders).mockResolvedValue([{ ...order, status, paidAt: null }]);
  render(<CustomerOrders />);
  fireEvent.click(await screen.findByRole('button', { name: 'Hide LUV-ORDER1' }));
  await waitFor(() => expect(screen.queryByRole('article')).toBeNull());
  expect(setCustomerOrderHidden).toHaveBeenCalledWith(order.id, true);
  vi.mocked(fetchCustomerOrders).mockResolvedValue([{ ...order, status, paidAt: null, hidden: true }]);
  fireEvent.click(screen.getByRole('button', { name: 'Hidden orders' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Restore LUV-ORDER1' }));
  await waitFor(() => expect(setCustomerOrderHidden).toHaveBeenLastCalledWith(order.id, false));
  vi.mocked(fetchCustomerOrders).mockResolvedValue([{ ...order, status, paidAt: null }]);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Current & past orders' }).hasAttribute('disabled')).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: 'Current & past orders' }));
  expect(await screen.findByRole('article')).toBeTruthy();
});
it('does not hide paid or failed-link orders and reports hide errors', async () => {
  vi.mocked(fetchCustomerOrders).mockResolvedValue([order, { ...order, id: 'bad', reference: 'BAD', status: 'expired', paidAt: null }]);
  vi.mocked(setCustomerOrderHidden).mockRejectedValue(new Error('Unable to hide order.'));
  render(<CustomerOrders />);
  await screen.findByRole('article', { name: 'Order LUV-ORDER1' });
  expect(screen.queryByRole('button', { name: 'Hide LUV-ORDER1' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Hide BAD' }));
  await screen.findByRole('alert');
  expect(screen.getByRole('article', { name: 'Order BAD' })).toBeTruthy();
});
it('updates paid order fulfilment independently of payment status', async () => {
  const fulfilment = { status: 'confirmed' as const, courierName: '', trackingNumber: '', trackingUrl: '', updatedAt: null };
  const load = vi.fn().mockResolvedValue([{ ...order, fulfilment }]);
  vi.mocked(updateOrderFulfilment).mockResolvedValue({ ...fulfilment, status: 'shipped',
    courierName: 'Courier', trackingNumber: 'TRACK123', trackingUrl: 'https://courier.example/track/123', updatedAt: '2026-10-10T15:00:00Z' });
  render(<CustomerOrders loadOrders={load} admin />);
  fireEvent.click(screen.getByRole('button', { name: 'Online orders' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Show details for LUV-ORDER1' }));
  fireEvent.change(screen.getByLabelText('Order status'), { target: { value: 'shipped' } });
  fireEvent.change(screen.getByLabelText('Courier name (optional)'), { target: { value: 'Courier' } });
  fireEvent.change(screen.getByLabelText('Tracking number (optional)'), { target: { value: 'TRACK123' } });
  fireEvent.change(screen.getByLabelText('Tracking link (optional, HTTPS)'), { target: { value: 'https://courier.example/track/123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save order status' }));
  expect(await screen.findByText('Order: Shipped')).toBeTruthy();
  expect(screen.getByText('Payment received')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Track shipment' }).getAttribute('href')).toBe('https://courier.example/track/123');
  expect(updateOrderFulfilment).toHaveBeenCalledWith('order-1', 'confirmed', expect.objectContaining({ status: 'shipped', trackingNumber: 'TRACK123' }));
  expect(screen.getByRole('status').textContent).toContain('Customer email queued');
});
it('shows customer shipment progress without admin editing controls', async () => {
  vi.mocked(fetchCustomerOrders).mockResolvedValue([{ ...order, fulfilment: {
    status: 'delivered', courierName: 'Courier', trackingNumber: '123', trackingUrl: 'https://courier.example/123', updatedAt: null,
  } }]);
  render(<CustomerOrders />);
  expect(await screen.findByText('Delivered', { selector: 'span' })).toBeTruthy();
  expect(screen.getByLabelText('Order status for LUV-ORDER1').textContent).toBe('StatusDelivered');
  expect(screen.queryByText('Payment received')).toBeNull();
  expect(screen.queryByText(/ · Paid /)).toBeNull();
  expect(screen.getByRole('link', { name: 'Track shipment' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Save order status' })).toBeNull();
});
it.each(['confirmed', 'processing', 'shipped', 'delivered'] as const)('shows %s prominently as the single customer status', async status => {
  vi.mocked(fetchCustomerOrders).mockResolvedValue([{ ...order, fulfilment: {
    status, courierName: '', trackingNumber: '', trackingUrl: '', updatedAt: null,
  } }]);
  render(<CustomerOrders />);
  const summary = await screen.findByLabelText('Order status for LUV-ORDER1');
  expect(summary.textContent).toBe(`Status${status[0].toUpperCase()}${status.slice(1)}`);
  expect(summary.querySelector('.text-lg.font-bold')).toBeTruthy();
  expect(screen.queryByText('Payment received')).toBeNull();
});
it('shows Confirmed for paid orders without fulfilment and preserves actionable unpaid statuses', async () => {
  vi.mocked(fetchCustomerOrders).mockResolvedValue([order,
    { ...order, id: 'pending', reference: 'PENDING', status: 'link_created', paidAt: null },
    { ...order, id: 'review', reference: 'REVIEW', status: 'review_required', paidAt: null }]);
  render(<CustomerOrders />);
  expect((await screen.findByLabelText('Order status for LUV-ORDER1')).textContent).toBe('StatusConfirmed');
  expect(screen.getByLabelText('Order status for PENDING').textContent).toBe('StatusAwaiting payment');
  expect(screen.getByLabelText('Order status for REVIEW').textContent).toBe('StatusPayment under review');
  expect(screen.queryByText('Payment received')).toBeNull();
});
it('reports fulfilment save failures without changing the displayed status', async () => {
  const load = vi.fn().mockResolvedValue([{ ...order, fulfilment: {
    status: 'confirmed', courierName: '', trackingNumber: '', trackingUrl: '', updatedAt: null,
  } }]);
  vi.mocked(updateOrderFulfilment).mockRejectedValue(new Error('Order status changed. Refresh orders before saving.'));
  render(<CustomerOrders loadOrders={load} admin />);
  fireEvent.click(screen.getByRole('button', { name: 'Online orders' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Show details for LUV-ORDER1' }));
  fireEvent.change(screen.getByLabelText('Order status'), { target: { value: 'processing' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save order status' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Refresh orders');
  expect(screen.getByText('Order: Confirmed')).toBeTruthy();
});
afterEach(cleanup);
it('shows the empty state without claiming an enquiry is an order', async () => {
  render(<CustomerOrders />);
  expect(await screen.findByText('No orders yet.')).toBeTruthy();
  expect(screen.getByText(/WhatsApp\/email enquiries are not confirmed orders/)).toBeTruthy();
});
it('shows saved order details and refreshes the current order status', async () => {
  vi.mocked(fetchCustomerOrders).mockResolvedValue([order]);
  render(<CustomerOrders />);
  expect(await screen.findByText('Confirmed')).toBeTruthy();
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
  expect(fetchCustomerOrders).toHaveBeenLastCalledWith(20, false);
});
it('collapses admin order details and allows confirming removal only for cancelled entries', async () => {
  const cancelled = { ...order, id: 'cancelled', reference: 'LUV-CANCELLED', status: 'cancelled' as const, paidAt: null };
  const load = vi.fn().mockResolvedValueOnce([order, cancelled]).mockResolvedValueOnce([order]);
  render(<CustomerOrders loadOrders={load} admin />);
  fireEvent.click(screen.getByRole('button', { name: 'Online orders' }));
  const show = await screen.findByRole('button', { name: 'Show details for LUV-ORDER1' });
  expect(show.getAttribute('aria-expanded')).toBe('false');
  expect(screen.getByText('Rose Charm (Pink)', { selector: '#order-details-order-1 span' }).closest('div')?.hidden).toBe(true);
  fireEvent.click(show);
  expect(screen.getByRole('button', { name: 'Hide details for LUV-ORDER1' }).getAttribute('aria-expanded')).toBe('true');
  expect(screen.queryByRole('button', { name: 'Remove LUV-ORDER1 from list' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Remove LUV-CANCELLED from list' }));
  expect(hideCancelledLiveOrder).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm removal' }));
  await waitFor(() => expect(hideCancelledLiveOrder).toHaveBeenCalledWith('cancelled'));
  await waitFor(() => expect(screen.queryByRole('article', { name: 'Order LUV-CANCELLED' })).toBeNull());
  expect(load).toHaveBeenLastCalledWith(0);
});
it.each(['cancelled', 'expired'])('shows %s removal failures without removing the entry', async status => {
  const load = vi.fn().mockResolvedValue([{ ...order, status, paidAt: null }]);
  vi.mocked(hideCancelledLiveOrder).mockRejectedValue(new Error('Removal unavailable.'));
  render(<CustomerOrders loadOrders={load} admin />);
  fireEvent.click(screen.getByRole('button', { name: 'Online orders' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Remove LUV-ORDER1 from list' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm removal' }));
  expect((await screen.findByRole('alert')).textContent).toBe('Removal unavailable.');
  expect(screen.getByRole('article', { name: 'Order LUV-ORDER1' })).toBeTruthy();
});
it('removes expired entries only after confirmation', async () => {
  const load = vi.fn().mockResolvedValueOnce([{ ...order, status: 'expired', paidAt: null }]).mockResolvedValueOnce([]);
  render(<CustomerOrders loadOrders={load} admin />);
  fireEvent.click(screen.getByRole('button', { name: 'Online orders' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Remove LUV-ORDER1 from list' }));
  expect(hideCancelledLiveOrder).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm removal' }));
  await waitFor(() => expect(hideCancelledLiveOrder).toHaveBeenCalledWith('order-1'));
  expect(await screen.findByText('No orders yet.')).toBeTruthy();
});
