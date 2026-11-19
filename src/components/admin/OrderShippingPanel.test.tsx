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
  render(<OrderShippingPanel orderId="order" fulfilment={fulfilment} items={[]} onSaved={saved} />);
  fireEvent.click(screen.getByRole('button',{ name: 'Manage courier shipping' }));
  await screen.findByRole('button',{ name: 'Refresh shipping status' });
}
it('loads on demand and never books immediately after payment',() => {
  render(<OrderShippingPanel orderId="order" fulfilment={fulfilment} items={[]} onSaved={saved} />);
  expect(requestOrderShipping).not.toHaveBeenCalled();
  expect(screen.queryByLabelText('Packed weight (kg)')).toBeNull();
});
it('prefills editable package suggestions but requires confirmation of the guessed weight',async () => {
  vi.mocked(requestOrderShipping).mockResolvedValueOnce(initial);
  render(<OrderShippingPanel orderId="order" fulfilment={fulfilment} items={[
    { productName: 'Bunny Toy',quantity: 1 },{ productName: 'Lotus Flower Decor',quantity: 1 },
  ]} onSaved={saved} />);
  fireEvent.click(screen.getByRole('button',{ name: 'Manage courier shipping' }));
  await screen.findByRole('button',{ name: 'Refresh shipping status' });
  expect((screen.getByLabelText('Length (cm)') as HTMLInputElement).value).toBe('27');
  expect((screen.getByLabelText('Width (cm)') as HTMLInputElement).value).toBe('22');
  expect((screen.getByLabelText('Height (cm)') as HTMLInputElement).value).toBe('14');
  expect((screen.getByLabelText('Packed weight (kg)') as HTMLInputElement).value).toBe('0.5');
  expect(screen.getByRole('button',{ name: 'Check available couriers' }).hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByRole('checkbox'));
  expect(screen.getByRole('button',{ name: 'Check available couriers' }).hasAttribute('disabled')).toBe(false);
  fireEvent.change(screen.getByLabelText('Packed weight (kg)'),{ target: { value: '1.5' } });
  expect((screen.getByLabelText('Packed weight (kg)') as HTMLInputElement).value).toBe('1.5');
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
it('switches providers only after a new quote and schedules warehouse pickups in the same panel',async () => {
  await open(quoted);
  fireEvent.change(screen.getByLabelText('Approve courier'),{ target: { value: '10' } });
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.change(screen.getByLabelText('Shipping partner'),{ target: { value: 'delhivery' } });
  expect(screen.queryByLabelText('Approve courier')).toBeNull();
  const delhivery = { ...quoted,provider: 'delhivery' as const,
    quotes: [{ id: 1,name: 'Delhivery Surface',charge: 90,days: null,recommended: false }] };
  vi.mocked(requestOrderShipping).mockResolvedValueOnce(delhivery);
  fireEvent.click(screen.getByRole('button',{ name: 'Check available couriers' }));
  await screen.findByRole('option',{ name: /Delhivery Surface/ });
  expect(requestOrderShipping).toHaveBeenLastCalledWith('order','quote',{
    provider: 'delhivery',parcel: { weight: 0.5,length: 20,breadth: 15,height: 10 },
  });
  fireEvent.change(screen.getByLabelText('Approve courier'),{ target: { value: '1' } });
  fireEvent.click(screen.getByRole('checkbox'));
  vi.mocked(requestOrderShipping).mockResolvedValueOnce({ ...delhivery,awb: '1234567890',courierName: 'Delhivery Surface' });
  fireEvent.click(screen.getByRole('button',{ name: /Book Delhivery Surface/ }));
  await screen.findByText(/AWB: 1234567890/);
  expect(screen.getByText(/pickup covers the entire warehouse/)).toBeTruthy();
  expect(screen.getByRole('button',{ name: 'Request pickup' }).hasAttribute('disabled')).toBe(true);
  fireEvent.change(screen.getByLabelText('Pickup date'),{ target: { value: '2099-12-01' } });
  fireEvent.change(screen.getByLabelText('Pickup time (IST)'),{ target: { value: '12:30' } });
  fireEvent.change(screen.getByLabelText('Expected parcels'),{ target: { value: '3' } });
  fireEvent.click(screen.getByRole('checkbox'));
  vi.mocked(requestOrderShipping).mockResolvedValueOnce({ ...delhivery,awb: '1234567890',courierName: 'Delhivery Surface',
    warehousePickup: { id: 'pickup',date: '2099-12-01',time: '12:30:00',count: 3,state: 'confirmed',
      pickupId: 'PUR123',createdAt: new Date().toISOString(),lastError: null } });
  fireEvent.click(screen.getByRole('button',{ name: 'Request pickup' }));
  await screen.findByText(/ID PUR123/);
  expect(requestOrderShipping).toHaveBeenLastCalledWith('order','pickup',{
    pickupDate: '2099-12-01',pickupTime: '12:30',packageCount: 3,confirmed: true,
  });
  expect(screen.getByRole('button',{ name: 'Clear verified pickup' }).hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByRole('checkbox'));
  vi.mocked(requestOrderShipping).mockResolvedValueOnce({ ...delhivery,awb: '1234567890',courierName: 'Delhivery Surface',warehousePickup: null });
  fireEvent.click(screen.getByRole('button',{ name: 'Clear verified pickup' }));
  await waitFor(() => expect(requestOrderShipping).toHaveBeenLastCalledWith('order','pickup-resolve',{ pickupId: 'pickup',confirmed: true }));
  expect(screen.queryByLabelText('Shipping partner')).toBeNull();
});

it('blocks repeat Delhivery requests after an uncertain response until refreshed',async () => {
  await open({ ...initial,provider: 'delhivery',awb: '123',courierName: 'Delhivery Surface' });
  fireEvent.change(screen.getByLabelText('Pickup date'),{ target: { value: '2099-12-01' } });
  fireEvent.change(screen.getByLabelText('Pickup time (IST)'),{ target: { value: '12:30' } });
  fireEvent.change(screen.getByLabelText('Expected parcels'),{ target: { value: '1' } });
  fireEvent.click(screen.getByRole('checkbox'));
  vi.mocked(requestOrderShipping).mockRejectedValueOnce(new Error('Timeout'));
  fireEvent.click(screen.getByRole('button',{ name: 'Request pickup' }));
  await screen.findByText('Timeout');
  expect(screen.getByRole('button',{ name: 'Request pickup' }).hasAttribute('disabled')).toBe(true);
  expect(screen.getByText(/Pickup status may have changed/)).toBeTruthy();
});
