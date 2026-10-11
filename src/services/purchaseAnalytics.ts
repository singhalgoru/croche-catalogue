import { loadSupabase } from '../lib/supabaseConfig';
import { canTrackAnalytics, trackEvent } from './analytics';
import { canTrackMeta, trackMetaEvent } from './meta';

export interface PurchaseAnalytics {
  transaction_id: string;
  currency: 'INR';
  value: number;
  shipping: number;
  total: number;
  items: {
    item_id: string; item_name: string; item_variant: string; variant_id: string;
    price: number; quantity: number;
  }[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));
const isAmount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

export async function fetchPurchaseAnalytics(requestId: string): Promise<PurchaseAnalytics | null> {
  const client = await loadSupabase();
  if (!client) throw new Error('Purchase analytics requires an online connection.');
  const { data, error } = await client.rpc('get_live_purchase_analytics', { request_id: requestId });
  if (error) throw new Error(`Unable to load verified purchase analytics: ${error.message}`);
  if (data === null) return null;
  const value: unknown = data;
  if (!isRecord(value) || typeof value.transaction_id !== 'string' || !value.transaction_id
    || value.currency !== 'INR' || !isAmount(value.value) || !isAmount(value.shipping) || !isAmount(value.total)
    || Math.abs(value.total - value.value - value.shipping) > 0.01 || !Array.isArray(value.items) || !value.items.length) {
    throw new Error('Invalid verified purchase analytics response.');
  }
  const items = value.items.map((item: unknown) => {
    if (!isRecord(item) || typeof item.item_id !== 'string' || typeof item.item_name !== 'string'
      || typeof item.item_variant !== 'string' || typeof item.variant_id !== 'string'
      || !isAmount(item.price) || typeof item.quantity !== 'number' || !Number.isSafeInteger(item.quantity) || item.quantity < 1) {
      throw new Error('Invalid verified purchase analytics item.');
    }
    return { item_id: item.item_id, item_name: item.item_name, item_variant: item.item_variant,
      variant_id: item.variant_id, price: item.price, quantity: item.quantity };
  });
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  if (subtotal <= 0 || value.value > subtotal + 0.01) throw new Error('Invalid verified purchase item total.');
  return { transaction_id: value.transaction_id, currency: value.currency, value: value.value,
    shipping: value.shipping, total: value.total, items };
}

const delivered = new Set<string>();
const pending = new Map<string, Promise<void>>();
const wasSent = (key: string) => {
  if (delivered.has(key)) return true;
  try { return localStorage.getItem(key) === 'sent'; }
  catch (error) { console.error('Purchase analytics deduplication storage unavailable:', error); return false; }
};
const markSent = (key: string) => {
  delivered.add(key);
  try { localStorage.setItem(key, 'sent'); }
  catch (error) { console.error('Purchase analytics cannot persist deduplication across reloads:', error); }
};

export const trackVerifiedPurchase = (requestId: string): Promise<void> => {
  if (!canTrackAnalytics() && !canTrackMeta()) return Promise.resolve();
  const existing = pending.get(requestId);
  if (existing) return existing;
  const task = (async () => {
    const purchase = await fetchPurchaseAnalytics(requestId);
    if (!purchase) return;
    const gaKey = `luvia:purchase:ga:${purchase.transaction_id}`;
    const metaKey = `luvia:purchase:meta:${purchase.transaction_id}`;
    const subtotal = purchase.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const items = purchase.items.map(item => {
      const price = item.price * purchase.value / subtotal;
      return { ...item, price, discount: item.price - price };
    });
    if (!wasSent(gaKey) && trackEvent('purchase', {
      transaction_id: purchase.transaction_id, currency: purchase.currency,
      value: purchase.value, shipping: purchase.shipping, items,
    })) markSent(gaKey);
    if (!wasSent(metaKey) && trackMetaEvent('Purchase', {
      currency: purchase.currency, value: purchase.total, content_type: 'product',
      content_ids: purchase.items.map(item => item.item_id),
      contents: items.map(item => ({ id: item.item_id, quantity: item.quantity, item_price: item.price })),
      num_items: purchase.items.reduce((count, item) => count + item.quantity, 0),
    }, `purchase-${purchase.transaction_id}`)) markSent(metaKey);
  })().catch(error => {
    console.error('Verified purchase analytics failed; payment confirmation is unaffected:', error);
  }).finally(() => { pending.delete(requestId); });
  pending.set(requestId, task);
  return task;
};
