import { beforeEach, expect, it, vi } from 'vitest';
import { requestOrderShipping, type ShippingState } from './orderShipping';
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../lib/supabaseConfig',() => ({ loadSupabase: async () => ({ functions: { invoke } }) }));
const state: ShippingState = { parcel: null,quotes: [],quotedAt: null,shipmentId: null,awb: null,courierName: null,
  labelUrl: null,pickupRequested: false,reviewRequired: false,busy: false,lastError: null,trackingStatus: null,syncedAt: null,
  fulfilment: { status: 'confirmed',courierName: '',trackingNumber: '',trackingUrl: '',updatedAt: null } };
beforeEach(() => invoke.mockReset().mockResolvedValue({ data: state,error: null }));
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
