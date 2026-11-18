import { loadSupabase } from '../lib/supabaseConfig';
import type { PatternLanguage, PreparedPattern } from './patternDocuments';

export interface ProductPattern {
  revision: string;
  filename: string;
  updated_at: string;
  size: number;
  pdf_filename: string;
  pdf_size: number;
  language: PatternLanguage;
}
export interface PatternRecipient { id: string; name: string; email: string }
export interface PatternEmail {
  id: string;
  recipient_email: string;
  filename: string;
  created_at: string;
  accepted_at: string | null;
  attempts: number;
  last_error: string | null;
}
export interface PatternWorkspace {
  pattern: ProductPattern | null;
  recipients: PatternRecipient[];
  emails: PatternEmail[];
}
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const isPattern = (value: unknown): value is ProductPattern => record(value)
  && typeof value.revision === 'string' && typeof value.filename === 'string'
  && typeof value.updated_at === 'string' && typeof value.size === 'number'
  && typeof value.pdf_filename === 'string' && typeof value.pdf_size === 'number'
  && (value.language === 'en' || value.language === 'hi');
async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const db = await loadSupabase();
  if (!db) throw new Error('Product patterns require an online connection.');
  const { data, error } = await db.rpc(name, args);
  if (error) throw new Error(`Product pattern action failed: ${error.message}`);
  return data;
}
async function receipt(name: string, args: Record<string, unknown>, id: string): Promise<void> {
  if (await rpc(name, args) !== id) throw new Error('Pattern action could not be confirmed. Refresh before retrying.');
}
export async function fetchPatternWorkspace(productId: string): Promise<PatternWorkspace> {
  const data = await rpc('product_pattern_workspace', { target_product: productId });
  if (!record(data) || !(data.pattern === null || isPattern(data.pattern))
    || !Array.isArray(data.recipients) || !data.recipients.every((row): row is PatternRecipient => record(row)
      && typeof row.id === 'string' && typeof row.name === 'string' && typeof row.email === 'string')
    || !Array.isArray(data.emails) || !data.emails.every((row): row is PatternEmail => record(row)
      && typeof row.id === 'string' && typeof row.recipient_email === 'string' && typeof row.filename === 'string'
      && typeof row.created_at === 'string' && (row.accepted_at === null || typeof row.accepted_at === 'string')
      && typeof row.attempts === 'number' && (row.last_error === null || typeof row.last_error === 'string'))) {
    throw new Error('Invalid product pattern response.');
  }
  return { pattern: data.pattern, recipients: data.recipients, emails: data.emails };
}
export function validatePatternFile(file: File): void {
  if (file.size < 100 || file.size > 2 * 1024 * 1024 || file.name.length > 120
    || !/^[A-Za-z0-9][A-Za-z0-9_. -]*\.docx$/.test(file.name)) {
    throw new Error('Choose an editable .docx pattern up to 2 MB, using a simple filename (letters, numbers, spaces, dots, hyphens or underscores).');
  }
}
async function base64(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' && reader.result.includes(';base64,')
      ? resolve(reader.result.split(';base64,')[1]!) : reject(new Error('Unable to read the Word pattern.'));
    reader.onerror = () => reject(new Error('Unable to read the Word pattern.'));
    reader.readAsDataURL(file);
  });
}
export async function uploadProductPattern(productId: string, previous: string | null, revision: string,
  prepared: PreparedPattern, language: PatternLanguage): Promise<void> {
  validatePatternFile(prepared.word);
  if (!/^[A-Za-z0-9][A-Za-z0-9_. -]*\.pdf$/.test(prepared.pdf.name) || prepared.pdf.size < 100
    || prepared.pdf.size > 2 * 1024 * 1024) throw new Error('Prepare a PDF up to 2 MB before saving.');
  const [data, pdf] = await Promise.all([base64(prepared.word), base64(prepared.pdf)]);
  if (!data.startsWith('UEsDB') || !pdf.startsWith('JVBERi0')) throw new Error('Invalid prepared Word or PDF document.');
  await receipt('save_product_pattern', { target_product: productId, expected_revision: previous,
    new_revision: revision, document_name: prepared.word.name, document_data: data,
    pdf_name: prepared.pdf.name, pdf_data: pdf, pattern_language: language }, revision);
}
export async function downloadProductPattern(productId: string, revision: string, format: 'word' | 'pdf' = 'word'): Promise<void> {
  const data = await rpc(format === 'pdf' ? 'read_product_pattern_pdf' : 'read_product_pattern',
    { target_product: productId, expected_revision: revision });
  if (!record(data) || typeof data.filename !== 'string' || !data.filename.endsWith(format === 'pdf' ? '.pdf' : '.docx')
    || typeof data.data !== 'string' || data.data.length > 2796204
    || !(format === 'pdf' ? /^JVBERi0[A-Za-z0-9+/]*={0,2}$/ : /^UEsDB[A-Za-z0-9+/]*={0,2}$/).test(data.data)) {
    throw new Error('Invalid pattern download.');
  }
  const bytes = Uint8Array.from(atob(data.data), char => char.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: format === 'pdf' ? 'application/pdf'
    : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = data.filename;
  document.body.append(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function removeProductPattern(productId: string, revision: string): Promise<void> {
  await receipt('remove_product_pattern', { target_product: productId, expected_revision: revision }, revision);
}
export async function queuePatternEmail(productId: string, revision: string, artisanId: string, requestId: string, message: string): Promise<void> {
  if (!artisanId || message.length > 1500) throw new Error('Choose a Trial or Approved artisan and a message up to 1,500 characters.');
  await receipt('queue_product_pattern_email', { target_product: productId, expected_revision: revision,
    artisan_id: artisanId, request_id: requestId, artisan_message: message }, requestId);
}
