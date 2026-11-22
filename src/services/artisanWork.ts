import { loadSupabase } from '../lib/supabaseConfig';
import { isWorkOffer, type WorkOffer } from '../../supabase/functions/_shared/artisanWorkEmail';

export interface WorkDraftItem {
  productId: string | null;
  name: string;
  quantity: number;
  rateWithYarn: number;
  rateWithoutYarn: number;
  yarnBasis: 'with' | 'without';
  patternRevision: string | null;
}
export interface WorkDraft {
  recipientName: string;
  recipientEmail: string;
  subject: string;
  message: string;
  deliveryDate: string;
  courierCap: number;
  advancePercent: number;
  items: WorkDraftItem[];
}
export interface WorkAssignment {
  id: string;
  offer: WorkOffer;
  createdAt: string;
  acceptedAt: string | null;
  completedAt: string | null;
  expiresAt: string;
  offerSentAt: string | null;
  offerError: string | null;
  offerAttempts: number;
  confirmationSentAt: string | null;
  confirmationError: string | null;
  confirmationAttempts: number | null;
}
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const nullableString = (value: unknown): value is string | null => value === null || typeof value === 'string';
async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const db = await loadSupabase();
  if (!db) throw new Error('Work assignments require an online connection.');
  const { data, error } = await db.rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}
export async function createWorkAssignment(id: string, artisanId: string, draft: WorkDraft): Promise<void> {
  if (await rpc('create_artisan_work_assignment', { request_id: id, artisan_id: artisanId, draft }) !== id) {
    throw new Error('Assignment receipt could not be confirmed. Retry this same request.');
  }
}
export async function listWorkAssignments(artisanId: string): Promise<WorkAssignment[]> {
  const data = await rpc('list_artisan_work_assignments', { artisan_id: artisanId });
  if (!Array.isArray(data) || !data.every((item): item is WorkAssignment => record(item)
    && typeof item.id === 'string' && isWorkOffer(item.offer)
    && typeof item.createdAt === 'string' && typeof item.expiresAt === 'string'
    && [item.acceptedAt, item.completedAt, item.offerSentAt, item.offerError,
      item.confirmationSentAt, item.confirmationError].every(nullableString)
    && typeof item.offerAttempts === 'number'
    && (item.confirmationAttempts === null || typeof item.confirmationAttempts === 'number'))) {
    throw new Error('Invalid assignment history response.');
  }
  return data;
}
export async function completeWorkAssignment(id: string): Promise<void> {
  if (await rpc('complete_artisan_work_assignment', { assignment_id: id }) !== true) throw new Error('Completion could not be confirmed.');
}
export async function readWorkAssignment(token: string): Promise<{ offer: WorkOffer; acceptedAt: string | null; completedAt: string | null; expiresAt: string }> {
  const data = await rpc('read_artisan_work_assignment', { token });
  if (!record(data) || !isWorkOffer(data.offer) || !nullableString(data.acceptedAt)
    || !nullableString(data.completedAt) || typeof data.expiresAt !== 'string') throw new Error('Invalid assignment response.');
  return { offer: data.offer, acceptedAt: data.acceptedAt, completedAt: data.completedAt, expiresAt: data.expiresAt };
}
export async function acceptWorkAssignment(token: string): Promise<void> {
  if (await rpc('accept_artisan_work_assignment', { token }) !== true) throw new Error('Acceptance could not be confirmed. Retry this same link.');
}
