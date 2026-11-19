import { createOrderPayload, positive, safeLabel, type PackageDetails } from './shiprocket.ts';

const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Delhivery returned an invalid response.');
  return value as Record<string, unknown>;
};

export interface DelhiveryConfig { token: string; pickupPin: string; pickupLocation: string; volumetricDivisor: number }

export function readDelhiveryConfig(env: (key: string) => string | undefined): DelhiveryConfig {
  const token = env('DELHIVERY_LIVE_TOKEN')?.trim();
  const pickupPin = env('DELHIVERY_PICKUP_PINCODE')?.trim();
  const pickupLocation = env('DELHIVERY_PICKUP_LOCATION')?.trim();
  const divisor = Number(env('DELHIVERY_VOLUMETRIC_DIVISOR'));
  if (!token || !pickupPin || !/^[1-9][0-9]{5}$/.test(pickupPin) || !pickupLocation
    || !Number.isInteger(divisor) || divisor < 1000 || divisor > 100000) {
    throw new Error('Delhivery is not configured. Set its API token, pickup pincode, registered pickup location and rate-card volumetric divisor.');
  }
  return { token, pickupPin, pickupLocation,volumetricDivisor: divisor };
}

export function chargeableWeight(parcel: PackageDetails, divisor: number): number {
  const volume = Math.ceil(parcel.length) * Math.ceil(parcel.breadth) * Math.ceil(parcel.height);
  return Math.ceil(Math.max(parcel.weight * 1000, volume * 1000 / divisor));
}

export function createDelhiveryClient(token: string) {
  return async (path: string, body?: string): Promise<unknown> => {
    const response = await fetch(`https://track.delhivery.com${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Token ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      ...(body === undefined ? {} : { body }),
      signal: AbortSignal.timeout(path.startsWith('/api/kinko/') ? 70000 : 15000),
    });
    if (!response.ok) throw new Error(`Delhivery request failed (HTTP ${response.status}).`);
    try { return await response.json(); } catch { throw new Error('Delhivery returned an invalid response.'); }
  };
}

export function serviceable(value: unknown, pin: string): boolean {
  const codes = record(value).delivery_codes;
  if (!Array.isArray(codes)) throw new Error('Delhivery returned an invalid serviceability response.');
  if (!codes.length) return false;
  const matches = codes.map(code => record(record(code).postal_code)).filter(code => String(code.pin) === pin);
  if (!matches.length) throw new Error('Delhivery returned a mismatched pincode.');
  return matches.some(code => code.pre_paid === 'Y' && !String(code.remarks ?? '').trim());
}

export function shippingCharge(value: unknown): number {
  if (!Array.isArray(value) || value.length !== 1) throw new Error('Delhivery returned an invalid shipping estimate.');
  return positive(record(value[0]).total_amount);
}

export function delhiveryPayload(order: Record<string, unknown>, items: Record<string, unknown>[],
  parcel: PackageDetails, pickupLocation: string) {
  const validated = createOrderPayload(order, items, parcel, pickupLocation);
  const total = positive(order.total_paise) / 100;
  if (total >= 50000) throw new Error('Delhivery shipments of ₹50,000 or more require an e-waybill. Arrange this shipment manually.');
  const address = record(order.delivery_details);
  if ([pickupLocation,validated.order_id,validated.billing_customer_name,validated.billing_address,validated.billing_address_2,
    validated.billing_city,validated.billing_state,address.email,...items.map(item => item.product_name)]
    .some(value => typeof value === 'string' && /[&#%;\\]/.test(value))) {
    throw new Error('Delhivery does not accept a special character in these shipment details. Arrange shipping manually.');
  }
  return {
    pickup_location: { name: pickupLocation },
    shipments: [{
      name: validated.billing_customer_name,
      add: [validated.billing_address, validated.billing_address_2].filter(Boolean).join(', '),
      pin: validated.billing_pincode, city: validated.billing_city, state: validated.billing_state,
      country: 'India', phone: validated.billing_phone, order: validated.order_id,
      payment_mode: 'Prepaid', total_amount: total,
      products_desc: items.map(item => String(item.product_name)).join(', '),
      quantity: items.reduce((sum, item) => sum + Number(item.quantity), 0),
      weight: Math.ceil(parcel.weight * 1000), shipment_length: parcel.length,
      shipment_width: parcel.breadth, shipment_height: parcel.height, shipping_mode: 'Surface',
      email: address.email,
    }],
  };
}

export function createdWaybill(value: unknown, reference: string): string {
  const root = record(value);
  if (root.success !== true || !Array.isArray(root.packages) || root.packages.length !== 1) {
    throw new Error('Delhivery did not confirm shipment creation.');
  }
  const shipment = record(root.packages[0]);
  if (shipment.status !== 'Success' || shipment.refnum !== reference || shipment.serviceable !== true
    || typeof shipment.waybill !== 'string' || !/^[0-9]{1,30}$/.test(shipment.waybill)) {
    throw new Error('Delhivery did not confirm a matching serviceable shipment and waybill.');
  }
  return shipment.waybill;
}

export function labelUrl(value: unknown, waybill: string): string {
  const packages = record(value).packages;
  if (!Array.isArray(packages)) throw new Error('Delhivery did not return a label.');
  const matched = packages.map(record).find(item => String(item.wbn) === waybill);
  if (!matched) throw new Error('Delhivery did not return a label for this waybill.');
  return safeLabel(matched.pdf_download_link);
}

export function tracking(value: unknown, waybill: string): { status: string; expectedDate: string | null } {
  const list = record(value).ShipmentData;
  if (!Array.isArray(list) || list.length !== 1) throw new Error('Delhivery tracking is not available yet.');
  const shipment = record(record(list[0]).Shipment);
  if (String(shipment.Waybill) !== waybill) throw new Error('Delhivery returned tracking for another waybill.');
  const current = record(shipment.Status);
  if (typeof current.Status !== 'string' || typeof current.StatusType !== 'string') {
    throw new Error('Delhivery returned an invalid tracking status.');
  }
  const raw = current.Status.trim().toUpperCase();
  const type = current.StatusType.trim().toUpperCase();
  const status = type === 'DL' && raw === 'DELIVERED' ? 'DELIVERED'
    : type === 'RT' ? `RTO ${raw}`
      : type === 'UD' && ['IN TRANSIT','DISPATCHED','OUT FOR DELIVERY','PICKED UP'].includes(raw)
        ? 'IN TRANSIT' : `DELHIVERY ${raw}`;
  const eta = shipment.ExpectedDeliveryDate;
  let expectedDate: string | null = null;
  if (eta !== null && eta !== undefined && eta !== '') {
    if (typeof eta !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:[ T].*)?$/.test(eta)) {
      throw new Error('Delhivery returned an invalid delivery estimate.');
    }
    expectedDate = eta.slice(0,10);
    const parsed = new Date(`${expectedDate}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== expectedDate) {
      throw new Error('Delhivery returned an invalid delivery estimate.');
    }
  }
  return { status, expectedDate };
}
