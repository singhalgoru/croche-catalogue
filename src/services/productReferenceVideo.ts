import { loadSupabase } from '../lib/supabaseConfig';

export function validateReferenceVideoUrl(value: string): string {
  const input = value.trim();
  if (!input || input.length > 2048 || /\s/.test(input)) {
    throw new Error('Enter a complete HTTPS video link of up to 2,048 characters.');
  }
  let url: URL;
  try { url = new URL(input); }
  catch { throw new Error('Enter a complete video link starting with https://.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.href.length > 2048) {
    throw new Error('Use an HTTPS video link without embedded credentials.');
  }
  return url.href;
}

async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const db = await loadSupabase();
  if (!db) throw new Error('Reference videos require an online connection.');
  const { data, error } = await db.rpc(name, args);
  if (error) throw new Error(`Reference video action failed: ${error.message}`);
  return data;
}

export async function fetchReferenceVideo(productId: string): Promise<string | null> {
  const data = await rpc('read_product_reference_video', { target_product: productId });
  if (data === null) return null;
  if (typeof data !== 'string') throw new Error('Invalid reference video response.');
  validateReferenceVideoUrl(data);
  return data;
}

export async function saveReferenceVideo(productId: string, previous: string | null, value: string | null): Promise<string | null> {
  const url = value === null ? null : validateReferenceVideoUrl(value);
  const data = await rpc('save_product_reference_video', {
    target_product: productId, expected_url: previous, new_url: url,
  });
  if (data !== url) throw new Error('Reference video change could not be confirmed. Refresh before retrying.');
  return url;
}
