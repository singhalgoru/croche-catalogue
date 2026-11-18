import { loadSupabase } from '../lib/supabaseConfig';
import { convertImageForUpload } from '../utils/imageUploadConversion';
import { getImageStorageErrorMessage } from './r2ImageStorage';
import { MAX_PRODUCT_IMAGE_SOURCE_SIZE, MAX_PROCESSED_IMAGE_SIZE } from '../utils/imageUploadLimits';

const ORIGINAL_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export async function archiveImageOriginal(file: File): Promise<string> {
  const extension = ORIGINAL_EXTENSIONS[file.type];
  if (!extension || file.size === 0 || file.size > MAX_PRODUCT_IMAGE_SOURCE_SIZE) {
    throw new Error('Choose a JPG, PNG or WebP image no larger than 20 MB to preserve its original.');
  }
  const client = await loadSupabase();
  if (!client) throw new Error('Supabase is not configured.');
  const cleanImage = await convertImageForUpload(file, { watermark: false });
  if (cleanImage.size > MAX_PROCESSED_IMAGE_SIZE) throw new Error('The processed private image exceeds 6 MB.');
  const imageId = crypto.randomUUID();
  const form = new FormData();
  form.append('action', 'archive-original');
  form.append('imageId', imageId);
  form.append('original', cleanImage, 'original.webp');
  const { data, error } = await client.functions.invoke('r2-images', { body: form });
  if (error) {
    throw new Error(`Unable to save the private image original. The image was not published: ${await getImageStorageErrorMessage(error)}`);
  }
  if (data?.imageId !== imageId) throw new Error('Private original archive returned an invalid response.');
  return imageId;
}
