import { loadSupabase } from '../lib/supabaseConfig';
import { isApplication, type ArtisanApplication } from './artisans';

export const artisanPaymentMethods = ['UPI', 'Bank transfer', 'Cash', 'Other'] as const;
export interface ArtisanPaymentInput {
  date: string;
  amount: string;
  method: typeof artisanPaymentMethods[number];
  reference: string;
  description: string;
}
export interface ArtisanComment {
  id: string;
  body: string;
  created_at: string;
}
export interface ArtisanPayment {
  id: string;
  paid_on: string;
  amount: number;
  method: string;
  reference: string;
  description: string;
  created_at: string;
  voided_at: string | null;
  void_reason: string | null;
}
export interface ArtisanActivity {
  comments: ArtisanComment[];
  payments: ArtisanPayment[];
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const db = await loadSupabase();
  if (!db) throw new Error('Artisan profiles require an online connection.');
  const { data, error } = await db.rpc(name, args);
  if (error) throw new Error(`Unable to update or load the artisan profile: ${error.message}`);
  return data;
}
async function receipt(name: string, args: Record<string, unknown>, id: string): Promise<void> {
  if (await rpc(name, args) !== id) throw new Error('Artisan update could not be confirmed. Refresh before retrying.');
}
export async function saveArtisanSkills(application: ArtisanApplication, rating: number | null, capabilities: string): Promise<ArtisanApplication> {
  if ((rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) || capabilities.length > 2000) {
    throw new Error('Use a skill rating from 1 to 5 and capabilities up to 2,000 characters.');
  }
  const data = await rpc('save_artisan_skills', {
    application_id: application.id, expected_version: application.version, rating, can_create: capabilities,
  });
  if (!isApplication(data)) throw new Error('Invalid artisan skills receipt. Refresh before retrying.');
  return data;
}
export async function fetchArtisanActivity(id: string): Promise<ArtisanActivity> {
  const data = await rpc('artisan_activity', { application_id: id });
  if (!record(data) || !Array.isArray(data.comments) || !Array.isArray(data.payments)
    || !data.comments.every((row): row is ArtisanComment => record(row) && typeof row.id === 'string'
      && typeof row.body === 'string' && typeof row.created_at === 'string')
    || !data.payments.every((row): row is ArtisanPayment => record(row) && typeof row.id === 'string'
      && ['paid_on', 'method', 'reference', 'description', 'created_at'].every(key => typeof row[key] === 'string')
      && typeof row.amount === 'number' && Number.isFinite(row.amount) && row.amount > 0
      && (row.voided_at === null || typeof row.voided_at === 'string')
      && (row.void_reason === null || typeof row.void_reason === 'string'))) throw new Error('Invalid artisan activity response.');
  return { comments: data.comments, payments: data.payments };
}
export async function addArtisanComment(id: string, requestId: string, body: string): Promise<void> {
  if (!body.trim() || body.trim().length > 3000) throw new Error('Enter a comment up to 3,000 characters.');
  await receipt('add_artisan_comment', { application_id: id, request_id: requestId, comment_body: body }, requestId);
}
export async function recordArtisanPayment(id: string, requestId: string, input: ArtisanPaymentInput): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !/^\d+(?:\.\d{1,2})?$/.test(input.amount)
    || Number(input.amount) <= 0 || Number(input.amount) > 10000000 || !artisanPaymentMethods.includes(input.method)
    || input.reference.trim().length > 200 || (input.method !== 'Cash' && !input.reference.trim())
    || !input.description.trim() || input.description.trim().length > 1000) {
    throw new Error('Check payment date, positive amount (two decimals), method, reference and work description.');
  }
  await receipt('record_artisan_payment', {
    application_id: id, request_id: requestId, payment_date: input.date, payment_amount: Number(input.amount),
    payment_method: input.method, payment_reference: input.reference, payment_description: input.description,
  }, requestId);
}
export async function voidArtisanPayment(id: string, reason: string): Promise<void> {
  if (!reason.trim() || reason.trim().length > 500) throw new Error('Enter a correction reason up to 500 characters.');
  await receipt('void_artisan_payment', { payment_id: id, reason }, id);
}
export async function readArtisanPhoto(id: string): Promise<string> {
  const data = await rpc('read_artisan_profile_photo', { application_id: id });
  if (!record(data) || data.contentType !== 'image/webp' || typeof data.data !== 'string'
    || data.data.length > 1398104 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data.data)) throw new Error('Invalid profile photo response.');
  return `data:image/webp;base64,${data.data}`;
}
export async function removeArtisanPhoto(application: ArtisanApplication): Promise<void> {
  await receipt('remove_artisan_profile_photo', { application_id: application.id, expected_version: application.version }, application.id);
}
