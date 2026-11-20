import { loadSupabase } from '../lib/supabaseConfig';
import { getImageStorageErrorMessage } from './r2ImageStorage';
import type { OrderFulfilment } from '../types/customer';

export interface ShippingPackage { weight: number; length: number; breadth: number; height: number }
export interface ShippingQuote { id: number; name: string; charge: number; days: number | null; recommended: boolean }
export interface WarehousePickup {
  id: string; date: string; time: string; count: number; state: 'pending' | 'confirmed' | 'review';
  pickupId: string | null; createdAt: string; lastError: string | null;
}
export interface ShippingState {
  provider?: 'shiprocket' | 'delhivery' | 'shadowfax';
  warehousePickup?: WarehousePickup | null;
  warehousePickupError?: string | null;
  marginBasis?: { revenue: number; gst: number; gatewayFee: number; productCosts: number } | null;
  parcel: ShippingPackage | null;
  quotes: ShippingQuote[];
  quotedAt: string | null;
  shipmentId: number | null;
  awb: string | null;
  courierName: string | null;
  labelUrl: string | null;
  pickupRequested: boolean;
  reviewRequired: boolean;
  busy: boolean;
  lastError: string | null;
  trackingStatus: string | null;
  syncedAt: string | null;
  fulfilment: OrderFulfilment;
}
const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
const nullableString = (value: unknown) => value === null || typeof value === 'string';
const validParcel = (value: unknown): value is ShippingPackage => object(value)
  && ['weight','length','breadth','height'].every(key => positive(value[key]));
const validQuotes = (value: unknown): value is ShippingQuote[] => Array.isArray(value)
  && value.every(q => object(q) && positive(q.id) && Number.isSafeInteger(q.id)
    && typeof q.name === 'string' && positive(q.charge) && (q.days === null || positive(q.days)) && typeof q.recommended === 'boolean');
function validState(value: unknown): value is ShippingState {
  if (!object(value) || !object(value.fulfilment) || !Array.isArray(value.quotes)) return false;
  const f = value.fulfilment;
  const estimate = f.deliveryEstimate;
  const basis = value.marginBasis;
  const pickup = value.warehousePickup;
  if (value.warehousePickupError !== undefined && !nullableString(value.warehousePickupError)) return false;
  if (pickup !== undefined && pickup !== null && (!object(pickup)
    || typeof pickup.id !== 'string' || typeof pickup.date !== 'string' || typeof pickup.time !== 'string'
    || !positive(pickup.count) || !Number.isInteger(pickup.count)
    || !['pending','confirmed','review'].includes(String(pickup.state))
    || !nullableString(pickup.pickupId) || typeof pickup.createdAt !== 'string'
    || !Number.isFinite(Date.parse(pickup.createdAt)) || !nullableString(pickup.lastError))) return false;
  if (basis !== undefined && basis !== null
    && (!object(basis) || !['revenue','gst','gatewayFee','productCosts'].every(key =>
      typeof basis[key] === 'number' && Number.isFinite(basis[key]) && basis[key] >= 0))) return false;
  if (estimate !== undefined && estimate !== null && (!object(estimate)
    || typeof estimate.courierName !== 'string'
    || !(estimate.transitDays === null || positive(estimate.transitDays))
    || !nullableString(estimate.expectedDate) || !nullableString(estimate.updatedAt))) return false;
  return ['confirmed','processing','shipped','delivered'].includes(String(f.status))
    && (value.provider === undefined || value.provider === 'shiprocket' || value.provider === 'delhivery' || value.provider === 'shadowfax')
    && ['courierName','trackingNumber','trackingUrl'].every(key => typeof f[key] === 'string')
    && nullableString(f.updatedAt)
    && ['quotedAt','awb','courierName','labelUrl','lastError','trackingStatus','syncedAt'].every(key => nullableString(value[key]))
    && ['pickupRequested','reviewRequired','busy'].every(key => typeof value[key] === 'boolean')
    && (value.shipmentId === null || (positive(value.shipmentId) && Number.isSafeInteger(value.shipmentId)))
    && (value.parcel === null || validParcel(value.parcel))
    && validQuotes(value.quotes);
}
export interface SampleRateResult {
  provider: 'shiprocket' | 'delhivery' | 'shadowfax'; quotes: ShippingQuote[]; error: string | null;
}
export async function compareSampleShippingRates(pincode: string, parcel: ShippingPackage): Promise<SampleRateResult[]> {
  const db = await loadSupabase();
  if (!db) throw new Error('Shipping requires an online connection.');
  const { data,error } = await db.functions.invoke('order-shipping',{ body: { action: 'sample-rates',pincode,parcel,includeShadowfax: true } });
  if (error) throw new Error(await getImageStorageErrorMessage(error));
  if (object(data) && typeof data.error === 'string') throw new Error(data.error);
  if (!object(data) || !Array.isArray(data.providers) || data.providers.length !== 3
    || !data.providers.every((item: unknown, index: number) => object(item)
      && item.provider === ['shiprocket','delhivery','shadowfax'][index]
      && validQuotes(item.quotes) && nullableString(item.error))) throw new Error('Invalid sample shipping rates response.');
  return data.providers;
}
export async function requestOrderShipping(orderId: string, action: 'status' | 'quote' | 'book' | 'label' | 'pickup' | 'pickup-resolve' | 'sync',
  options: { parcel?: ShippingPackage; courierId?: number; quotedAt?: string; readyToShip?: boolean;
    provider?: 'shiprocket' | 'delhivery' | 'shadowfax'; pickupDate?: string; pickupTime?: string; packageCount?: number;
    pickupId?: string; confirmed?: boolean } = {}): Promise<ShippingState> {
  const db = await loadSupabase();
  if (!db) throw new Error('Shipping requires an online connection.');
  const { data,error } = await db.functions.invoke('order-shipping',{ body: { orderId,action,...options } });
  if (error) throw new Error(await getImageStorageErrorMessage(error));
  if (object(data) && typeof data.error === 'string') throw new Error(data.error);
  if (!validState(data)) throw new Error('Invalid shipping response. Refresh shipping status before retrying.');
  return data;
}
