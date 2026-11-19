// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { chargeableWeight, createDelhiveryClient, createdPickupId, createdWaybill, delhiveryPayload, labelUrl, pickupDetails,
  serviceable, shippingCharge, tracking } from './delhivery';

const parcel = { weight: 0.75,length: 20,breadth: 15,height: 10 };
const order = { reference: 'LUV-123',created_at: '2026-11-19T00:00:00Z',subtotal_paise: 50000,
  total_paise: 50000,shipping_paise: 0,discount_paise: 0,
  delivery_details: { name: 'Buyer',phone: '9876543210',email: 'buyer@example.test',
    addressLine1: '12 Test Street',city: 'Delhi',state: 'Delhi',pincode: '110001' } };
const items = [{ product_name: 'Rose',variant_id: 'v1',quantity: 1,unit_price_paise: 50000 }];
afterEach(() => vi.unstubAllGlobals());

it('validates future India pickup times, parcel counts and provider confirmation',() => {
  const now = Date.parse('2026-11-19T09:00:00Z');
  expect(pickupDetails('2026-11-19','15:00',3,now)).toEqual({
    pickup_date: '2026-11-19',pickup_time: '15:00:00',expected_package_count: 3,
  });
  for (const [date,time,count] of [['2026-11-19','14:00',1],['2026-02-30','15:00',1],
    ['2027-01-01','25:00',1],['2027-01-01','15:00',0],['2027-01-01','15:00',1.5]] as const) {
    expect(() => pickupDetails(date,time,count,now)).toThrow();
  }
  expect(createdPickupId({ pickup_id: 123 })).toBe('123');
  expect(() => createdPickupId({ success: false,pickup_id: 123 })).toThrow();
  expect(() => createdPickupId({ success: true })).toThrow();
});

it('authenticates server-side and does not retry failed provider mutations',async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('provider details', { status: 500 }));
  vi.stubGlobal('fetch',fetch);
  const api = createDelhiveryClient('fixture-token');
  await expect(api('/api/cmu/create.json','format=json&data={}')).rejects.toThrow('HTTP 500');
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith('https://track.delhivery.com/api/cmu/create.json',expect.objectContaining({
    method: 'POST',body: 'format=json&data={}',headers: expect.objectContaining({ Authorization: 'Token fixture-token' }),
  }));
});

it('requires a matching, non-embargoed prepaid serviceable pincode',() => {
  const code = (pin: number,pre_paid: string,remarks = '') => ({ delivery_codes: [{ postal_code: { pin,pre_paid,remarks } }] });
  expect(serviceable(code(110001,'Y'),'110001')).toBe(true);
  expect(serviceable(code(110001,'N'),'110001')).toBe(false);
  expect(serviceable(code(110001,'Y','Embargo'),'110001')).toBe(false);
  expect(serviceable({ delivery_codes: [] },'110001')).toBe(false);
  expect(() => serviceable(code(110002,'Y'),'110001')).toThrow('mismatched');
  expect(() => serviceable({},'110001')).toThrow();
});

it('uses the provider total including tax and rejects absent or invalid estimates',() => {
  expect(shippingCharge([{ total_amount: 106.2,gross_amount: 90 }])).toBe(106.2);
  for (const value of [[],[{}],[{ total_amount: 0 }],{}]) expect(() => shippingCharge(value)).toThrow();
});

it('quotes the higher of actual and rate-card volumetric weight, rounding dimensions up',() => {
  expect(chargeableWeight(parcel,5000)).toBe(750);
  expect(chargeableWeight({ weight: 0.5,length: 20.1,breadth: 15,height: 10 },5000)).toBe(630);
});

it('builds a prepaid shipment using grams and the registered warehouse',() => {
  expect(delhiveryPayload(order,items,parcel,'Main warehouse')).toMatchObject({
    pickup_location: { name: 'Main warehouse' },
    shipments: [{ order: 'LUV-123',pin: '110001',payment_mode: 'Prepaid',weight: 750,
      shipment_length: 20,shipment_width: 15,shipment_height: 10,total_amount: 500,shipping_mode: 'Surface' }],
  });
  expect(() => delhiveryPayload({ ...order,total_paise: 5000000 },items,parcel,'Main')).toThrow('e-waybill');
  expect(() => delhiveryPayload({ ...order,delivery_details: { ...order.delivery_details,addressLine1: '12 A & B' } },
    items,parcel,'Main')).toThrow('special character');
  expect(() => delhiveryPayload(order,items,parcel,'Warehouse & Store')).toThrow('special character');
});

it('accepts only a confirmed serviceable waybill matching the order',() => {
  const response = { success: true,packages: [{ status: 'Success',serviceable: true,refnum: 'LUV-123',waybill: '1234567890' }] };
  expect(createdWaybill(response,'LUV-123')).toBe('1234567890');
  expect(() => createdWaybill(response,'OTHER')).toThrow();
  expect(() => createdWaybill({ ...response,packages: [{ ...response.packages[0],serviceable: false }] },'LUV-123')).toThrow();
  expect(() => createdWaybill({ success: false,packages: [] },'LUV-123')).toThrow();
});

it('only exposes a matching HTTPS label and does not treat returns as customer delivery',() => {
  expect(labelUrl({ packages: [{ wbn: '123',pdf_download_link: 'https://labels.example/test.pdf' }] },'123'))
    .toBe('https://labels.example/test.pdf');
  expect(() => labelUrl({ packages: [{ wbn: '456',pdf_download_link: 'https://labels.example/test.pdf' }] },'123')).toThrow();
  expect(() => labelUrl({ packages: [{ wbn: '123',pdf_download_link: 'http://labels.example/test.pdf' }] },'123')).toThrow();
  const response = (type: string,status: string) => ({ ShipmentData: [{ Shipment: {
    Waybill: '123',Status: { StatusType: type,Status: status },ExpectedDeliveryDate: '2026-11-25T18:00:00',
  } }] });
  expect(tracking(response('DL','Delivered'),'123')).toEqual({ status: 'DELIVERED',expectedDate: '2026-11-25' });
  expect(tracking(response('RT','Delivered'),'123').status).toBe('RTO DELIVERED');
  expect(tracking(response('UD','In Transit'),'123').status).toBe('IN TRANSIT');
  expect(tracking(response('UD','Manifested'),'123').status).toBe('DELHIVERY MANIFESTED');
  expect(() => tracking(response('DL','Delivered'),'456')).toThrow('another waybill');
});
