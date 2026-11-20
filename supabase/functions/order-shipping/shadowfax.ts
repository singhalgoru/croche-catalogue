import { createOrderPayload, positive, safeLabel, type PackageDetails } from './shiprocket.ts';

const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Shadowfax returned an invalid response.');
  return value as Record<string, unknown>;
};

export function shadowfaxConfig(env: (key: string) => string | undefined, stagingCheck = false) {
  const token = env(stagingCheck ? 'SHADOWFAX_STAGING_API_TOKEN' : 'SHADOWFAX_API_TOKEN')?.trim();
  if (stagingCheck && !token) throw new Error('Set SHADOWFAX_STAGING_API_TOKEN before checking Shadowfax staging.');
  const pin = env('SHADOWFAX_PICKUP_PINCODE')?.trim();
  const supply = env('SHADOWFAX_SUPPLY_CHAIN')?.trim();
  const environment = stagingCheck ? 'staging' : env('SHADOWFAX_ENVIRONMENT')?.trim();
  if (!token || !pin || !/^[1-9]\d{5}$/.test(pin) || (supply !== 'regular' && supply !== 'surface')
    || (environment !== 'staging' && environment !== 'production')) {
    throw new Error('Shadowfax is not configured. Set its API token, pickup pincode, account supply chain and environment.');
  }
  return { token,pin,supply,environment };
}

export function shadowfaxPickup(env: (key: string) => string | undefined, pin: string) {
  const name = env('SHADOWFAX_PICKUP_NAME')?.trim();
  const contact = env('SHADOWFAX_PICKUP_PHONE')?.trim();
  const address = env('SHADOWFAX_PICKUP_ADDRESS')?.trim();
  const city = env('SHADOWFAX_PICKUP_CITY')?.trim();
  if (!name || name.length > 100 || !contact || !/^[0-9+]{10,14}$/.test(contact)
    || !address || !city || city.length > 50) throw new Error('Shadowfax pickup address and contact are not configured.');
  return { name,contact,address_line_1: address,city,pincode: Number(pin) };
}

export function createShadowfaxClient(token: string, environment: 'staging' | 'production') {
  return async (path: string, body?: unknown): Promise<unknown> => {
    const host = environment === 'staging' ? 'dale.staging.shadowfax.in' : 'dale.shadowfax.in';
    const response = await fetch(`https://${host}/api${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Token ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Shadowfax request failed (HTTP ${response.status}).`);
    try { return await response.json(); } catch { throw new Error('Shadowfax returned invalid JSON.'); }
  };
}

export function shadowfaxServiceable(value: unknown, pin: string, tier: string): boolean {
  if (!Array.isArray(value)) throw new Error('Shadowfax returned invalid serviceability.');
  return value.some(item => {
    const row = object(item);
    if (!Array.isArray(row.services) || row.services.some(s => typeof s !== 'string')) {
      throw new Error('Shadowfax returned invalid serviceability.');
    }
    return String(row.code) === pin && row.services.includes(tier);
  });
}

export function shadowfaxRate(value: unknown): number | null {
  const row = object(value);
  if (row.message === 'Rate not available for this origin and destination'
    && row.zone === null && row.shipping_rate === null && row.gst === null) return null;
  if (row.message !== 'Success' || typeof row.zone !== 'string'
    || typeof row.shipping_rate !== 'string' || typeof row.gst !== 'string'
    || !/^\d+(\.\d{1,2})?$/.test(row.shipping_rate) || !/^\d+(\.\d{1,2})?$/.test(row.gst)) {
    throw new Error('Shadowfax returned an invalid rate.');
  }
  return positive(Math.round((Number(row.shipping_rate) + Number(row.gst)) * 100) / 100);
}

export function shadowfaxPayload(order: Record<string, unknown>, items: Record<string, unknown>[],
  parcel: PackageDetails, pickup: ReturnType<typeof shadowfaxPickup>) {
  const payload = createOrderPayload(order,items,parcel,pickup.name);
  const subtotalPaise = positive(order.subtotal_paise);
  const discountPaise = Number(order.discount_paise);
  if (!Number.isSafeInteger(subtotalPaise) || !Number.isSafeInteger(discountPaise)
    || discountPaise < 0 || discountPaise > subtotalPaise) throw new Error('Invalid order pricing for Shadowfax.');
  if (subtotalPaise / 100 >= 50000) throw new Error('Shadowfax shipments of ₹50,000 or more require an e-waybill. Arrange this shipment manually.');
  let totalLines = 0;
  let taxablePaise = 0;
  for (const item of items) {
    const line = Number(item.line_total_paise);
    if (!Number.isSafeInteger(line) || line < 0 || !Array.isArray(item.seller_sales) || item.seller_sales.length !== 1) {
      throw new Error('Saved item prices and GST rates are required for Shadowfax.');
    }
    const sale = object(item.seller_sales[0]);
    const gst = Number(sale.gst_percent);
    if (sale.gst_percent === null || sale.gst_percent === undefined || !Number.isFinite(gst) || gst < 0 || gst > 100
      || Number(sale.quantity) !== Number(item.quantity)) throw new Error('Saved item prices and GST rates are required for Shadowfax.');
    totalLines += line;
    taxablePaise += line * (subtotalPaise - discountPaise) / subtotalPaise / (1 + gst / 100);
  }
  if (totalLines !== subtotalPaise) throw new Error('Saved item prices do not match the order subtotal.');
  const productValue = Math.round(taxablePaise) / 100;
  if (typeof payload.order_id !== 'string' || !payload.order_id || payload.order_id.length > 100
    || String(payload.billing_customer_name).length > 100 || String(payload.billing_city).length > 50
    || String(payload.billing_state).length > 40) throw new Error('Order details exceed Shadowfax field limits.');
  if (payload.order_items.some(item => typeof item.sku !== 'string' || !item.sku.trim()
    || item.sku.length > 100 || !item.name.trim())) throw new Error('Each item needs a valid SKU and product name for Shadowfax.');
  return {
    order_type: 'marketplace',
    customer_details: { name: payload.billing_customer_name,contact: payload.billing_phone,
      address_line_1: payload.billing_address,address2: payload.billing_address_2,city: payload.billing_city,
      state: payload.billing_state,pincode: Number(payload.billing_pincode) },
    order_details: { client_order_id: payload.order_id,product_value: productValue,payment_mode: 'prepaid',
      cod_amount: 0,actual_weight: parcel.weight,order_service: 'Regular',total_amount: positive(order.total_paise) / 100 },
    pickup_details: { pickup_type: 'seller',...pickup },
    return_details: { return_type: 'seller',...pickup },
    product_details: payload.order_items.map(item => ({ sku_name: item.name,sku_id: String(item.sku),
      price: item.selling_price,additional_details: { quantity: item.units } })),
  };
}

export function shadowfaxCreated(value: unknown, reference: string): string {
  const root = object(value);
  const data = object(root.data);
  if (root.message !== 'Success' || data.client_order_id !== reference || typeof data.awb_number !== 'string'
    || !/^[a-zA-Z0-9]{1,25}$/.test(data.awb_number)) throw new Error('Shadowfax did not confirm a matching shipment and AWB.');
  return data.awb_number;
}

export function shadowfaxLabel(value: unknown): string {
  const root = object(value);
  if (root.message !== 'Success') throw new Error('Shadowfax did not generate a label.');
  return safeLabel(object(root.data).label_url);
}

export function shadowfaxTracking(value: unknown, awb: string) {
  const root = object(value);
  const order = object(root.order_details);
  if (root.message !== 'Success' || order.awb_number !== awb || typeof order.status !== 'string'
    || !/^[a-z0-9_]{1,80}$/.test(order.status)) throw new Error('Shadowfax returned invalid tracking.');
  const status = order.status === 'delivered' ? 'DELIVERED'
    : ['picked','received_from_client_warehouse','recd_at_rev_hub','recd_at_fwd_hub','recd_at_fwd_dc','assigned_for_delivery','ofd'].includes(order.status)
      ? 'IN TRANSIT' : `SHADOWFAX ${order.status.toUpperCase()}`;
  const eta = order.promised_delivery_date;
  if (eta === null || eta === undefined || eta === '') return { status,expectedDate: null };
  if (typeof eta !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:[ T].*)?$/.test(eta)) throw new Error('Shadowfax returned an invalid delivery estimate.');
  const date = eta.slice(0,10);
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== date) throw new Error('Shadowfax returned an invalid delivery estimate.');
  return { status,expectedDate: date };
}
