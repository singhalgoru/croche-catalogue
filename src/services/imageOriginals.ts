import { loadSupabase } from '../lib/supabaseConfig';

export const ORIGINALS_BUCKET = 'product-originals';
const ORIGINAL_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export async function archiveImageOriginal(file: File, userId: string): Promise<string> {
  const extension = ORIGINAL_EXTENSIONS[file.type];
  if (!extension || file.size === 0 || file.size > 6 * 1024 * 1024) {
    throw new Error('Choose a JPG, PNG or WebP image no larger than 6 MB to preserve its original.');
  }
  const client = await loadSupabase();
  if (!client) throw new Error('Supabase is not configured.');
  const imageId = crypto.randomUUID();
  const { error } = await client.storage.from(ORIGINALS_BUCKET).upload(
    `${userId}/${imageId}/original.${extension}`,
    file,
    { contentType: file.type, upsert: false },
  );
  if (error) {
    throw new Error(`Unable to save the private image original. The image was not published: ${error.message}`);
  }
  return imageId;
}
