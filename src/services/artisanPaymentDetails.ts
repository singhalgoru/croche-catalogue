import { loadSupabase } from '../lib/supabaseConfig';

export type ArtisanPaymentDetails = {
  name: string;
  method: 'UPI' | 'Bank transfer';
  upi: string;
  account: string;
  ifsc: string;
};
export type ArtisanPaymentStatus = { provided: boolean; verified: boolean; requested: boolean };
export const emptyArtisanPayment = (): ArtisanPaymentDetails => ({ name: '',method: 'UPI',upi: '',account: '',ifsc: '' });
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
async function call(name: string, args: Record<string, unknown>): Promise<unknown> {
  const db = await loadSupabase();
  if (!db) throw new Error('Payment details require an online connection.');
  const { data,error } = await db.rpc(name,args);
  if (error) throw new Error(error.message);
  return data;
}
export async function paymentStatus(id: string): Promise<ArtisanPaymentStatus> {
  const data = await call('artisan_payment_status',{ application_id: id });
  if (!isRecord(data) || typeof data.provided !== 'boolean' || typeof data.verified !== 'boolean'
    || typeof data.requested !== 'boolean') throw new Error('Invalid payment status response.');
  return { provided: data.provided,verified: data.verified,requested: data.requested };
}
export async function requestPaymentDetails(id: string): Promise<void> {
  const data = await call('request_artisan_payment_details',{ application_id: id });
  if (typeof data !== 'string' || !/^[0-9a-f-]{36}$/i.test(data)) throw new Error('Payment request could not be confirmed.');
}
const selectedDetails = (details: ArtisanPaymentDetails) => details.method === 'UPI'
  ? { name: details.name,method: details.method,upi: details.upi }
  : { name: details.name,method: details.method,account: details.account,ifsc: details.ifsc };
export async function submitPaymentDetails(token: string, details: ArtisanPaymentDetails): Promise<void> {
  if (await call('submit_artisan_payment_details',{ token,details: selectedDetails(details),consent: true }) !== true) throw new Error('Payment details could not be confirmed.');
}
export async function readPaymentDetails(id: string): Promise<{ details: ArtisanPaymentDetails; verified: boolean } | null> {
  const data = await call('read_artisan_payment_details',{ application_id: id });
  if (data === null) return null;
  if (!isRecord(data) || !isRecord(data.details) || typeof data.verified !== 'boolean'
    || typeof data.details.name !== 'string' || (data.details.method !== 'UPI' && data.details.method !== 'Bank transfer')
    || (data.details.method === 'UPI' && typeof data.details.upi !== 'string')
    || (data.details.method === 'Bank transfer' && (typeof data.details.account !== 'string' || typeof data.details.ifsc !== 'string'))) {
    throw new Error('Invalid payment details response.');
  }
  return { verified: data.verified,details: { name: data.details.name,method: data.details.method,
    upi: typeof data.details.upi === 'string' ? data.details.upi : '',
    account: typeof data.details.account === 'string' ? data.details.account : '',
    ifsc: typeof data.details.ifsc === 'string' ? data.details.ifsc : '' } };
}
export async function savePaymentDetails(id: string, details: ArtisanPaymentDetails): Promise<void> {
  if (await call('save_artisan_payment_details',{ application_id: id,details: selectedDetails(details),confirmed: true }) !== true) {
    throw new Error('Payment details could not be saved.');
  }
}
