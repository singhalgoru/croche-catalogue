import { loadSupabase } from '../lib/supabaseConfig';
import { getImageStorageErrorMessage } from './r2ImageStorage';

export interface DtdcTestBooking {
  id: string;
  customer_reference: string;
  state: 'pending' | 'review' | 'booked' | 'cleared';
  awb: string | null;
  created_at: string;
}

const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

async function call(body: object): Promise<Record<string, unknown>> {
  const db = await loadSupabase();
  if (!db) throw new Error('DTDC sandbox requires an online connection.');
  const { data, error } = await db.functions.invoke('dtdc-sandbox', { body });
  if (error) throw new Error(await getImageStorageErrorMessage(error));
  if (object(data) && typeof data.error === 'string') throw new Error(data.error);
  if (!object(data)) throw new Error('Invalid DTDC sandbox response.');
  return data;
}

export async function listDtdcTests(): Promise<DtdcTestBooking[]> {
  const data = await call({ action: 'list' });
  if (!Array.isArray(data.bookings) || !data.bookings.every((item: unknown) => object(item)
    && typeof item.id === 'string' && typeof item.customer_reference === 'string'
    && ['pending', 'review', 'booked', 'cleared'].includes(String(item.state))
    && (item.awb === null || typeof item.awb === 'string')
    && typeof item.created_at === 'string' && Number.isFinite(Date.parse(item.created_at)))) {
    throw new Error('Invalid DTDC sandbox booking list.');
  }
  return data.bookings;
}

export async function bookDtdcTest(): Promise<void> {
  const data = await call({ action: 'book', confirmed: true });
  if (typeof data.id !== 'string' || typeof data.awb !== 'string' || !data.awb) {
    throw new Error('DTDC test booking could not be confirmed. Refresh and check DTDC before retrying.');
  }
}

export async function clearDtdcTest(id: string): Promise<void> {
  const data = await call({ action: 'clear', id, confirmed: true });
  if (data.cleared !== true) throw new Error('DTDC test booking was not cleared.');
}

export async function trackDtdcTest(id: string): Promise<string> {
  const data = await call({ action: 'track', id });
  if (typeof data.status !== 'string' || !data.status.trim()) throw new Error('Invalid DTDC tracking response.');
  return data.status;
}

export async function labelDtdcTest(id: string): Promise<Blob> {
  const data = await call({ action: 'label', id });
  if (typeof data.pdf !== 'string' || data.pdf.length > 7 * 1024 * 1024) throw new Error('Invalid DTDC label.');
  let decoded: string;
  try { decoded = atob(data.pdf); } catch { throw new Error('Invalid DTDC label.'); }
  if (!decoded.startsWith('%PDF-') || decoded.length > 5 * 1024 * 1024) throw new Error('Invalid DTDC label.');
  return new Blob([Uint8Array.from(decoded, char => char.charCodeAt(0))], { type: 'application/pdf' });
}
