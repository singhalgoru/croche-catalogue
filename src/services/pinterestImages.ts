import { loadSupabase } from '../lib/supabaseConfig';
import { convertImageForUpload, validatePinterestImage } from '../utils/imageUploadConversion';
import { archiveImageOriginal } from './imageOriginals';
import { uploadImageToR2 } from './r2ImageStorage';

export interface PinterestImage {
  image_path: string;
  image_url: string;
  revision: string;
}

const clientForImages = async () => {
  const client = await loadSupabase();
  if (!client) throw new Error('Supabase is not configured.');
  return client;
};

export async function getPinterestImage(variantId: string): Promise<PinterestImage | null> {
  const client = await clientForImages();
  const { data, error } = await client.from('pinterest_variant_images')
    .select('image_path,image_url,revision').eq('variant_id', variantId).maybeSingle();
  if (error) throw new Error(`Unable to load the Pinterest image: ${error.message}`);
  return data;
}

export async function savePinterestImage(variantId: string, file: File, previous: PinterestImage | null): Promise<PinterestImage> {
  await validatePinterestImage(file);
  const client = await clientForImages();
  const clean = await convertImageForUpload(file, { watermark: false });
  const imageId = await archiveImageOriginal(file);
  const upload = await uploadImageToR2(clean, imageId);
  const row = { image_path: upload.imagePath, image_url: upload.imageUrl, revision: crypto.randomUUID(), updated_at: new Date().toISOString() };
  const query = previous
    ? client.from('pinterest_variant_images').update(row).eq('variant_id', variantId).eq('revision', previous.revision)
    : client.from('pinterest_variant_images').insert({ variant_id: variantId, ...row });
  const { data, error } = await query.select('variant_id');
  if (error || !data?.length) {
    throw new Error(error
      ? `Unable to confirm the Pinterest image was saved: ${error.message}. Reload the saved photo before retrying.`
      : 'The Pinterest image changed. Reload it before trying again.');
  }
  return row;
}

export async function removePinterestImage(variantId: string, previous: PinterestImage): Promise<void> {
  const client = await clientForImages();
  const { data, error } = await client.from('pinterest_variant_images').delete()
    .eq('variant_id', variantId).eq('revision', previous.revision).select('variant_id');
  if (error) throw new Error(`Unable to remove the Pinterest image: ${error.message}`);
  if (!data?.length) throw new Error('The Pinterest image changed. Reload it before trying again.');
}
