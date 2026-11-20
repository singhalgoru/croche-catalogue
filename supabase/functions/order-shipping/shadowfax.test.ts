import { expect, it } from 'vitest';
import { shadowfaxConfig, shadowfaxCreated, shadowfaxLabel, shadowfaxPayload, shadowfaxPickup, shadowfaxRate,
  shadowfaxServiceable, shadowfaxTracking } from './shadowfax';

const settings: Record<string,string> = { SHADOWFAX_API_TOKEN: 'fixture',SHADOWFAX_PICKUP_PINCODE: '110001',
  SHADOWFAX_SUPPLY_CHAIN: 'regular',SHADOWFAX_ENVIRONMENT: 'production',SHADOWFAX_PICKUP_NAME: 'Shop',SHADOWFAX_PICKUP_PHONE: '9876543210',
  SHADOWFAX_PICKUP_ADDRESS: 'Test Road',SHADOWFAX_PICKUP_CITY: 'Delhi' };
const env = (key: string) => settings[key];
const parcel = { weight: 0.5,length: 20,breadth: 15,height: 10 };
const order = { reference: 'LUV-123',created_at: '2026-11-20T00:00:00Z',subtotal_paise: 50000,total_paise: 50000,
  discount_paise: 0,shipping_paise: 0,delivery_details: { name: 'Buyer',phone: '9876543210',email: 'buyer@example.test',
    addressLine1: 'Test Street',city: 'Delhi',state: 'Delhi',pincode: '110001' } };
const items = [{ product_name: 'Rose',variant_id: 'rose-pink',quantity: 2,unit_price_paise: 25000,
  line_total_paise: 50000,seller_sales: [{ quantity: 2,gst_percent: 5 }] }];

it('requires configured credentials, pickup and supply chain',() => {
  expect(shadowfaxConfig(env)).toMatchObject({ pin: '110001',supply: 'regular' });
  expect(() => shadowfaxConfig(() => undefined)).toThrow('not configured');
  expect(() => shadowfaxPickup(() => undefined,'110001')).toThrow('not configured');
});

it('checks the exact service tier and calculates rate including GST',() => {
  const response = [{ code: 110001,services: ['Marketplace'] }];
  expect(shadowfaxServiceable(response,'110001','Marketplace')).toBe(true);
  expect(shadowfaxServiceable(response,'110001','Surface_Mkt')).toBe(false);
  expect(shadowfaxServiceable(response,'110002','Marketplace')).toBe(false);
  expect(shadowfaxRate({ message: 'Success',zone: 'E',shipping_rate: '69.00',gst: '12.42' })).toBe(81.42);
  expect(shadowfaxRate({ message: 'Rate not available for this origin and destination',zone: null,shipping_rate: null,gst: null })).toBeNull();
  expect(() => shadowfaxRate({ message: 'Failure',shipping_rate: '69',gst: '0' })).toThrow();
});

it('builds a prepaid marketplace order and rejects missing e-waybill',() => {
  const pickup = shadowfaxPickup(env,'110001');
  expect(shadowfaxPayload(order,items,parcel,pickup)).toMatchObject({
    order_type: 'marketplace',order_details: { client_order_id: 'LUV-123',payment_mode: 'prepaid',actual_weight: 0.5,product_value: 476.19 },
    pickup_details: { pickup_type: 'seller',pincode: 110001 },return_details: { return_type: 'seller',pincode: 110001 },
    product_details: [{ sku_id: 'rose-pink',price: 250,additional_details: { quantity: 2 } }],
  });
  expect(() => shadowfaxPayload({ ...order,subtotal_paise: 5000000 },items,parcel,pickup)).toThrow('e-waybill');
  expect(() => shadowfaxPayload(order,[{ ...items[0],seller_sales: [] }],parcel,pickup)).toThrow('GST rates');
});

it('requires matching booking and tracking and never treats returns as delivered',() => {
  expect(shadowfaxCreated({ message: 'Success',data: { client_order_id: 'LUV-123',awb_number: 'SF123' } },'LUV-123')).toBe('SF123');
  expect(() => shadowfaxCreated({ message: 'Success',data: { client_order_id: 'other',awb_number: 'SF123' } },'LUV-123')).toThrow();
  expect(shadowfaxTracking({ message: 'Success',order_details: { awb_number: 'SF123',status: 'rts_d' } },'SF123').status).toBe('SHADOWFAX RTS_D');
  expect(shadowfaxTracking({ message: 'Success',order_details: { awb_number: 'SF123',status: 'delivered' } },'SF123').status).toBe('DELIVERED');
  expect(() => shadowfaxTracking({ message: 'Success',order_details: { awb_number: 'OTHER',status: 'delivered' } },'SF123')).toThrow();
  expect(() => shadowfaxLabel({ message: 'Success',data: { label_url: 'http://example.test/label' } })).toThrow();
});
