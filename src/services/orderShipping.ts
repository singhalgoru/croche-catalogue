import { loadSupabase } from '../lib/supabaseConfig';
import { getImageStorageErrorMessage } from './r2ImageStorage';
import type { OrderFulfilment } from '../types/customer';

export interface ShippingPackage { weight: number; length: number; breadth: number; height: number }
export interface ShippingQuote { id: number; name: string; charge: number; days: number | null; recommended: boolean }
export interface ShippingState {
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
function validState(value: unknown): value is ShippingState {
  if (!object(value) || !object(value.fulfilment) || !Array.isArray(value.quotes)) return false;
  const f = value.fulfilment;
  return ['confirmed','processing','shipped','delivered'].includes(String(f.status))
    && ['courierName','trackingNumber','trackingUrl'].every(key => typeof f[key] === 'string')
    && nullableString(f.updatedAt)
    && ['quotedAt','awb','courierName','labelUrl','lastError','trackingStatus','syncedAt'].every(key => nullableString(value[key]))
    && ['pickupRequested','reviewRequired','busy'].every(key => typeof value[key] === 'boolean')
    && (value.shipmentId === null || (positive(value.shipmentId) && Number.isSafeInteger(value.shipmentId)))
    && (value.parcel === null || validParcel(value.parcel))
    && value.quotes.every(q => object(q) && positive(q.id) && Number.isSafeInteger(q.id)
      && typeof q.name === 'string' && positive(q.charge) && (q.days === null || positive(q.days)) && typeof q.recommended === 'boolean');
}
export async function requestOrderShipping(orderId: string, action: 'status' | 'quote' | 'book' | 'label' | 'pickup' | 'sync',
  options: { parcel?: ShippingPackage; courierId?: number; quotedAt?: string; readyToShip?: boolean } = {}): Promise<ShippingState> {
  const db = await loadSupabase();
  if (!db) throw new Error('Shipping requires an online connection.');
  const { data,error } = await db.functions.invoke('order-shipping',{ body: { orderId,action,...options } });
  if (error) throw new Error(await getImageStorageErrorMessage(error));
  if (object(data) && typeof data.error === 'string') throw new Error(data.error);
  if (!validState(data)) throw new Error('Invalid shipping response. Refresh shipping status before retrying.');
  return data;
}
