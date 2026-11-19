import { beforeEach, expect, it, vi } from 'vitest';
import { compareSampleShippingRates, requestOrderShipping, type ShippingState } from './orderShipping';
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../lib/supabaseConfig',() => ({ loadSupabase: async () => ({ functions: { invoke } }) }));
const state: ShippingState = { parcel: null,quotes: [],quotedAt: null,shipmentId: null,awb: null,courierName: null,
  labelUrl: null,pickupRequested: false,reviewRequired: false,busy: false,lastError: null,trackingStatus: null,syncedAt: null,
  fulfilment: { status: 'confirmed',courierName: '',trackingNumber: '',trackingUrl: '',updatedAt: null } };
beforeEach(() => invoke.mockReset().mockResolvedValue({ data: state,error: null }));
it('validates and returns both sample-rate result sets',async () => {
  const providers = [
    { provider: 'shiprocket',quotes: [{ id: 1,name: 'Courier',charge: 80,days: 3,recommended: false }],error: null },
    { provider: 'delhivery',quotes: [],error: 'Unavailable' },
  ];
  invoke.mockResolvedValueOnce({ data: { providers },error: null });
  const parcel = { weight: 0.5,length: 20,breadth: 15,height: 10 };
  await expect(compareSampleShippingRates('110001',parcel)).resolves.toEqual(providers);
  expect(invoke).toHaveBeenCalledWith('order-shipping',{ body: { action: 'sample-rates',pincode: '110001',parcel } });
  invoke.mockResolvedValueOnce({ data: { providers: [providers[0]] },error: null });
  await expect(compareSampleShippingRates('110001',parcel)).rejects.toThrow('Invalid sample shipping rates response');
});
it('routes admin shipping requests through the authenticated function',async () => {
  await expect(requestOrderShipping('order','book',{ courierId: 10,quotedAt: 'timestamp',readyToShip: true })).resolves.toEqual(state);
  expect(invoke).toHaveBeenCalledWith('order-shipping',{ body: {
    orderId: 'order',action: 'book',courierId: 10,quotedAt: 'timestamp',readyToShip: true,
  } });
});
it('reports structured provider and transport errors',async () => {
  invoke.mockResolvedValueOnce({ error: { message: 'HTTP error',context: Response.json({ error: 'Reconcile shipment first.' }) } });
  await expect(requestOrderShipping('order','book')).rejects.toThrow('Reconcile shipment first.');
  invoke.mockResolvedValueOnce({ data: { error: 'Shipping not configured.' } });
  await expect(requestOrderShipping('order','quote')).rejects.toThrow('not configured');
});
it('loads persisted reconciliation and tracking failures as state, not request failures',async () => {
  invoke.mockResolvedValueOnce({ data: { ...state,reviewRequired: true,lastError: 'AWB assignment timed out.' } });
  await expect(requestOrderShipping('order','status')).resolves.toMatchObject({
    reviewRequired: true,lastError: 'AWB assignment timed out.',
  });
});
it.each([null,{}, { ...state,quotes: [{ id: 1,charge: -10 }] },{ ...state,fulfilment: null }])(
  'rejects malformed success responses: %j',async data => {
    invoke.mockResolvedValueOnce({ data });
    await expect(requestOrderShipping('order','status')).rejects.toThrow('Invalid shipping response');
  });
it('validates selected courier estimate fields',async () => {
  invoke.mockResolvedValueOnce({ data: { ...state,fulfilment: { ...state.fulfilment,deliveryEstimate: {
    courierName: 'Courier',transitDays: 4,expectedDate: '2026-10-25',updatedAt: null,
  } } } });
  await expect(requestOrderShipping('order','status')).resolves.toMatchObject({
    fulfilment: { deliveryEstimate: { transitDays: 4,expectedDate: '2026-10-25' } },
  });
  invoke.mockResolvedValueOnce({ data: { ...state,fulfilment: { ...state.fulfilment,deliveryEstimate: {
    courierName: 'Courier',transitDays: -1,expectedDate: null,updatedAt: null,
  } } } });
  await expect(requestOrderShipping('order','status')).rejects.toThrow('Invalid shipping response');
});
it('validates optional admin margin basis and preserves missing-ledger state',async () => {
  invoke.mockResolvedValueOnce({ data: { ...state,marginBasis: { revenue: 500,gst: 25,gatewayFee: 11.8,productCosts: 100 } } });
  await expect(requestOrderShipping('order','status')).resolves.toMatchObject({ marginBasis: { revenue: 500 } });
  invoke.mockResolvedValueOnce({ data: { ...state,marginBasis: null } });
  await expect(requestOrderShipping('order','status')).resolves.toMatchObject({ marginBasis: null });
  invoke.mockResolvedValueOnce({ data: { ...state,marginBasis: { revenue: 500,gst: -1,gatewayFee: 0,productCosts: 0 } } });
  await expect(requestOrderShipping('order','status')).rejects.toThrow('Invalid shipping response');
});
