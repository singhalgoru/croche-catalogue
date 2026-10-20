export { createShiprocketClient } from '../_shared/shiprocket.ts';
export interface PackageDetails { weight: number; length: number; breadth: number; height: number }
export interface CourierQuote { id: number; name: string; charge: number; days: number | null; recommended: boolean }
export const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid Shiprocket response.');
  return value as Record<string, unknown>;
};
export function positive(value: unknown): number {
  const number = typeof value === 'string' && value.trim() ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isFinite(number) || number <= 0) throw new Error('Invalid positive shipping value.');
  return number;
}
export function identifier(value: unknown): number {
  const number = positive(value);
  if (!Number.isSafeInteger(number)) throw new Error('Invalid shipping identifier.');
  return number;
}
export function parsePackage(value: unknown): PackageDetails {
  const input = record(value);
  const result = { weight: positive(input.weight), length: positive(input.length),
    breadth: positive(input.breadth), height: positive(input.height) };
  if (result.weight > 50 || [result.length,result.breadth,result.height].some(n => n < 0.5 || n > 200)) {
    throw new Error('Enter packed weight up to 50 kg and dimensions between 0.5 and 200 cm.');
  }
  return result;
}
export function parseCouriers(value: unknown): CourierQuote[] {
  const root = record(value);
  if (root.status === 404) return [];
  const data = record(root.data);
  if (!Array.isArray(data.available_courier_companies)) throw new Error('Shiprocket returned no courier list.');
  const recommended = Number(data.recommended_courier_company_id);
  return data.available_courier_companies.flatMap(value => {
    const item = record(value);
    if (item.blocked === 1 || item.blocked === true || item.is_available === 0) return [];
    const id = identifier(item.courier_company_id);
    if (typeof item.courier_name !== 'string' || !item.courier_name.trim()) throw new Error('Courier name missing.');
    const days = Number(item.estimated_delivery_days);
    return [{ id, name: item.courier_name, charge: positive(item.rate ?? item.freight_charge),
      days: Number.isFinite(days) && days > 0 ? days : null, recommended: id === recommended }];
  }).sort((a,b) => Number(b.recommended)-Number(a.recommended) || a.charge-b.charge);
}
export function safeLabel(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Shipping label missing.');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid shipping label link.');
  return url.href;
}
export function trackingStatus(value: unknown): string {
  const data = record(record(value).tracking_data);
  if (Number(data.track_status) !== 1 || !Array.isArray(data.shipment_track) || !data.shipment_track.length) {
    throw new Error('Tracking is not available yet. Retry after the courier updates the shipment.');
  }
  const status = record(data.shipment_track[0]).current_status;
  if (typeof status !== 'string' || !status.trim()) throw new Error('Tracking status missing.');
  return status.trim().toUpperCase();
}
export function trackingDeliveryDate(value: unknown): string | null {
  const data = record(record(value).tracking_data);
  const first = Array.isArray(data.shipment_track) && data.shipment_track.length
    ? record(data.shipment_track[0]) : null;
  const raw = data.etd || first?.edd;
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:[ T].*)?$/.test(raw)) {
    throw new Error('Shiprocket returned an invalid expected delivery date.');
  }
  const date = raw.slice(0,10);
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== date) {
    throw new Error('Shiprocket returned an invalid expected delivery date.');
  }
  return date;
}
export function createOrderPayload(order: Record<string, unknown>, items: Record<string, unknown>[],
  parcel: PackageDetails, pickupLocation: string) {
  const address = record(order.delivery_details);
  for (const field of ['name','phone','email','addressLine1','city','state','pincode']) {
    if (typeof address[field] !== 'string' || !address[field].trim()) throw new Error('Complete delivery details are required before shipping.');
  }
  if (!/^[1-9][0-9]{5}$/.test(String(address.pincode)) || !/^[6-9][0-9]{9}$/.test(String(address.phone))) {
    throw new Error('Invalid delivery phone or pincode.');
  }
  if (!items.length) throw new Error('Order items missing.');
  return {
    order_id: order.reference, order_date: new Date(String(order.created_at)).toISOString().slice(0,19).replace('T',' '),
    pickup_location: pickupLocation, billing_customer_name: address.name, billing_last_name: '',
    billing_address: address.addressLine1, billing_address_2: address.addressLine2 || '',
    billing_city: address.city, billing_pincode: address.pincode, billing_state: address.state,
    billing_country: 'India', billing_email: address.email, billing_phone: address.phone,
    shipping_is_billing: true, payment_method: 'Prepaid',
    order_items: items.map(item => ({ name: `${item.product_name}${item.variant_name ? ` (${item.variant_name})` : ''}`,
      sku: item.variant_id, units: identifier(item.quantity), selling_price: positive(item.unit_price_paise) / 100 })),
    sub_total: positive(order.subtotal_paise) / 100, total_discount: Number(order.discount_paise ?? 0) / 100,
    shipping_charges: Number(order.shipping_paise) / 100, ...parcel,
  };
}
