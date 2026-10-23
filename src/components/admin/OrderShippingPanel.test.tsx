import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import OrderShippingPanel from './OrderShippingPanel';
import { requestOrderShipping, type ShippingState } from '../../services/orderShipping';
vi.mock('../../services/orderShipping',() => ({ requestOrderShipping: vi.fn() }));
const fulfilment = { status: 'confirmed' as const,courierName: '',trackingNumber: '',trackingUrl: '',updatedAt: null };
const initial: ShippingState = { parcel: null,quotes: [],quotedAt: null,shipmentId: null,awb: null,courierName: null,
  labelUrl: null,pickupRequested: false,reviewRequired: false,busy: false,lastError: null,
  trackingStatus: null,syncedAt: null,fulfilment };
const quoted: ShippingState = { ...initial,parcel: { weight: 0.5,length: 20,breadth: 15,height: 10 },
  quotedAt: new Date().toISOString(),quotes: [{ id: 10,name: 'Courier',charge: 85,days: 3,recommended: true }] };
const saved = vi.fn();
beforeEach(() => { vi.mocked(requestOrderShipping).mockReset().mockResolvedValue(initial); saved.mockReset(); });
afterEach(cleanup);
async function open(state=initial) {
  vi.mocked(requestOrderShipping).mockResolvedValueOnce(state);
  render(<OrderShippingPanel orderId="order" fulfilment={fulfilment} onSaved={saved} />);
  fireEvent.click(screen.getByRole('button',{ name: 'Manage Shiprocket shipping' }));
  await screen.findByRole('button',{ name: 'Refresh shipping status' });
}
it('loads on demand and never books immediately after payment',() => {
  render(<OrderShippingPanel orderId="order" fulfilment={fulfilment} onSaved={saved} />);
  expect(requestOrderShipping).not.toHaveBeenCalled();
  expect(screen.queryByLabelText('Packed weight (kg)')).toBeNull();
});
it('shows profit and margin for every courier, including loss-making options, before approval',async () => {
  await open({ ...quoted,marginBasis: { revenue: 1050,gst: 50,gatewayFee: 24.78,productCosts: 600 },
    quotes: [...quoted.quotes,{ id: 11,name: 'Expensive courier',charge: 500,days: 2,recommended: false }] });
  expect(screen.getByRole('option',{ name: /Courier.*Est. profit ₹290.*margin 29.0%/ })).toBeTruthy();
  expect(screen.getByRole('option',{ name: /Expensive courier.*Est. profit -₹125.*margin -12.5%/ })).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Approve courier'),{ target: { value: '11' } });
  expect(screen.getByRole('status').textContent).toContain('margin -12.5%');
  expect(screen.getByText(/Verify saved costs/)).toBeTruthy();
  expect(requestOrderShipping).toHaveBeenCalledTimes(1);
});
it('explicitly reports unavailable margin instead of assuming missing costs are zero',async () => {
  await open(quoted);
  expect(screen.getByRole('option',{ name: /Est. margin unavailable/ })).toBeTruthy();
  expect(screen.getByText(/Estimated margins unavailable:/).textContent).toContain('saved sales cost records');
});
it('requires packed dimensions, courier approval and ready-to-ship confirmation',async () => {
  await open(quoted);
  fireEvent.change(screen.getByLabelText('Approve courier'),{ target: { value: '10' } });
  const book = screen.getByRole('button',{ name: /Book Courier/ });
  expect(book.hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByRole('checkbox'));
  expect(book.hasAttribute('disabled')).toBe(false);
  vi.mocked(requestOrderShipping).mockResolvedValueOnce({ ...quoted,shipmentId: 123,awb: 'AWB123',courierName: 'Courier' });
  fireEvent.click(book);
  await screen.findByText(/AWB: AWB123/);
  expect(requestOrderShipping).toHaveBeenLastCalledWith('order','book',{
    courierId: 10,quotedAt: quoted.quotedAt,readyToShip: true,
  });
  expect(saved).not.toHaveBeenCalled();
  expect(screen.queryByRole('button',{ name: /Book Courier/ })).toBeNull();
});
it('invalidates approval when package details change and sends explicit measured dimensions',async () => {
  await open(quoted);
  fireEvent.change(screen.getByLabelText('Approve courier'),{ target: { value: '10' } });
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.change(screen.getByLabelText('Packed weight (kg)'),{ target: { value: '0.75' } });
  expect(screen.queryByLabelText('Approve courier')).toBeNull();
  vi.mocked(requestOrderShipping).mockResolvedValueOnce(quoted);
  fireEvent.click(screen.getByRole('button',{ name: 'Check available couriers' }));
  await waitFor(() => expect(requestOrderShipping).toHaveBeenLastCalledWith('order','quote',{
    parcel: { weight: 0.75,length: 20,breadth: 15,height: 10 },
  }));
});
it('blocks expired quotes and reconciliation states',async () => {
  await open({ ...quoted,quotedAt: new Date(Date.now()-16*60*1000).toISOString() });
  fireEvent.change(screen.getByLabelText('Approve courier'),{ target: { value: '10' } });
  fireEvent.click(screen.getByRole('checkbox'));
  expect(screen.getByRole('button',{ name: /Book Courier/ }).hasAttribute('disabled')).toBe(true);
  vi.mocked(requestOrderShipping).mockResolvedValueOnce({ ...initial,reviewRequired: true,lastError: 'Provider timed out.' });
  fireEvent.click(screen.getByRole('button',{ name: 'Refresh shipping status' }));
  expect((await screen.findByRole('alert')).textContent).toContain('reconciliation');
  expect(screen.getByRole('button',{ name: 'Check available couriers' }).hasAttribute('disabled')).toBe(true);
});
it('surfaces ambiguous booking errors and blocks local repeat clicks until status refresh',async () => {
  await open(quoted);
  fireEvent.change(screen.getByLabelText('Approve courier'),{ target: { value: '10' } });
  fireEvent.click(screen.getByRole('checkbox'));
  vi.mocked(requestOrderShipping).mockRejectedValueOnce(new Error('Network timeout. Check Shiprocket.'));
  fireEvent.click(screen.getByRole('button',{ name: /Book Courier/ }));
  await screen.findByText('Network timeout. Check Shiprocket.');
  expect(screen.getByRole('button',{ name: /Book Courier/ }).hasAttribute('disabled')).toBe(true);
});
it('supports label, pickup and tracking without marking AWB creation as shipped',async () => {
  const booked = { ...quoted,shipmentId: 123,awb: 'AWB123',courierName: 'Courier' };
  await open(booked);
  vi.mocked(requestOrderShipping).mockResolvedValueOnce({ ...booked,labelUrl: 'https://labels.example/label.pdf' });
  fireEvent.click(screen.getByRole('button',{ name: 'Generate label' }));
  expect((await screen.findByRole('link',{ name: 'Open shipping label' })).getAttribute('href')).toBe('https://labels.example/label.pdf');
  vi.mocked(requestOrderShipping).mockResolvedValueOnce({ ...booked,pickupRequested: true });
  fireEvent.click(screen.getByRole('button',{ name: 'Request pickup' }));
  expect((await screen.findByRole('button',{ name: 'Pickup requested' })).hasAttribute('disabled')).toBe(true);
  vi.mocked(requestOrderShipping).mockResolvedValueOnce({ ...booked,fulfilment: {
    ...fulfilment,status: 'shipped',courierName: 'Courier',trackingNumber: 'AWB123',updatedAt: '2026-10-20T14:00:00Z',
  } });
  fireEvent.click(screen.getByRole('button',{ name: 'Sync courier tracking' }));
  await waitFor(() => expect(saved).toHaveBeenCalledWith(expect.objectContaining({ status: 'shipped' }),expect.any(String)));
});
