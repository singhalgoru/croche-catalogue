// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { createOrderPayload, createShiprocketClient, parseCouriers, parsePackage, safeLabel, trackingStatus } from './shiprocket';
const parcel = { weight: 0.75,length: 20,breadth: 15,height: 10 };
afterEach(() => vi.unstubAllGlobals());
it('validates measured package weight and dimensions without defaults',() => {
  expect(parsePackage(parcel)).toEqual(parcel);
  for (const value of [0,-1,NaN,Infinity,51]) expect(() => parsePackage({ ...parcel,weight: value })).toThrow();
  for (const value of [0,0.4,201]) expect(() => parsePackage({ ...parcel,length: value })).toThrow();
  expect(() => parsePackage(null)).toThrow();
});
it('keeps provider recommendations ahead of cheapest quotes and excludes blocked couriers',() => {
  expect(parseCouriers({ data: { recommended_courier_company_id: 2,available_courier_companies: [
    { courier_company_id: 1,courier_name: 'Budget',rate: '65',estimated_delivery_days: '5' },
    { courier_company_id: 2,courier_name: 'Recommended',rate: 90,estimated_delivery_days: 3 },
    { courier_company_id: 3,courier_name: 'Blocked',rate: 10,blocked: 1 },
  ] } })).toEqual([
    { id: 2,name: 'Recommended',charge: 90,days: 3,recommended: true },
    { id: 1,name: 'Budget',charge: 65,days: 5,recommended: false },
  ]);
  expect(parseCouriers({ status: 404 })).toEqual([]);
  expect(() => parseCouriers({ data: {} })).toThrow();
  expect(() => parseCouriers({ data: { available_courier_companies: [{ courier_company_id: -1 }] } })).toThrow();
});
it('builds prepaid shipments from immutable order snapshots with paise conversion',() => {
  const order = { reference: 'LUV-123',created_at: '2026-10-20T12:00:00Z',subtotal_paise: 100000,
    discount_paise: 5000,shipping_paise: 10000,delivery_details: {
      name: 'Buyer',phone: '9876543210',email: 'buyer@example.test',addressLine1: '12 Test Street',
      city: 'Delhi',state: 'Delhi',pincode: '110001',
    } };
  const items = [{ variant_id: 'variant',product_name: 'Rose',variant_name: 'Pink',quantity: 2,unit_price_paise: 50000 }];
  expect(createOrderPayload(order,items,parcel,'Primary')).toMatchObject({
    order_id: 'LUV-123',payment_method: 'Prepaid',sub_total: 1000,total_discount: 50,shipping_charges: 100,
    billing_phone: '9876543210',pickup_location: 'Primary',...parcel,
    order_items: [{ sku: 'variant',units: 2,selling_price: 500,name: 'Rose (Pink)' }],
  });
  expect(() => createOrderPayload({ ...order,delivery_details: {} },items,parcel,'Primary')).toThrow('Complete delivery');
});
it('only accepts safe HTTPS labels and actual tracking statuses',() => {
  expect(safeLabel('https://labels.example/one.pdf')).toBe('https://labels.example/one.pdf');
  for (const url of ['javascript:alert(1)','http://example.test','https://user:pass@example.test/']) {
    expect(() => safeLabel(url)).toThrow();
  }
  expect(trackingStatus({ tracking_data: { track_status: 1,shipment_track: [{ current_status: 'In Transit' }] } })).toBe('IN TRANSIT');
  expect(() => trackingStatus({ tracking_data: { track_status: 0,shipment_track: [] } })).toThrow('not available');
});
it('refreshes expired authentication once without retrying ambiguous provider failures',async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response('',{ status: 401 }))
    .mockResolvedValueOnce(Response.json({ token: 'new-token' }))
    .mockResolvedValueOnce(Response.json({ shipment_id: 123 }));
  vi.stubGlobal('fetch',fetcher);
  const write = vi.fn();
  const api = createShiprocketClient('api@example.test','fixture',{ read: async () => 'cached',write });
  expect(await api('/orders/create/adhoc',{ order_id: 'LUV-123' })).toEqual({ shipment_id: 123 });
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(write).toHaveBeenCalledWith('new-token',expect.any(String));
  fetcher.mockRejectedValueOnce(new Error('Timed out'));
  await expect(api('/orders/create/adhoc',{})).rejects.toThrow('Timed out');
  expect(fetcher).toHaveBeenCalledTimes(4);
});
