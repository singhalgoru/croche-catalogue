import { loadSupabase } from '../lib/supabaseConfig';
import { createResizedWebp } from '../utils/imageUploadConversion';
import { R2_IMAGE_WIDTHS } from '../utils/productImageUrl';

export const R2_IMAGE_PATH_PREFIX = 'r2:';
const FUNCTION_NAME = 'r2-images';

export interface StoredImage {
  imagePath: string;
  imageUrl: string;
}

export const isR2ImagePath = (imagePath: string) => imagePath.startsWith(R2_IMAGE_PATH_PREFIX);

const getErrorMessage = async (error: { message: string; context?: unknown }) => {
  if (error.context instanceof Response) {
    try {
      const payload: unknown = await error.context.clone().json();
      if (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string') {
        return payload.error;
      }
    } catch {
      // Fall back to the SDK message when the response is not JSON.
    }
  }
  return error.message;
};

/**
 * Uploads the full image plus fixed display widths to Cloudflare R2.
 * Fails explicitly when R2 is unavailable; never uploads to Supabase Storage.
 */
export async function uploadImageToR2(file: File, imageId?: string): Promise<StoredImage> {
  const supabase = await loadSupabase();
  if (!supabase) throw new Error('Supabase is not configured.');

  const form = new FormData();
  if (imageId) form.append('imageId', imageId);
  form.append('full', file, 'full.webp');
  for (const width of R2_IMAGE_WIDTHS) {
    form.append(`w${width}`, await createResizedWebp(file, width), `w${width}.webp`);
  }

  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, { body: form });
  if (error) {
    throw new Error(`Unable to upload the product image: ${await getErrorMessage(error)}`);
  }

  if (
    !data ||
    typeof data !== 'object' ||
    typeof data.imagePath !== 'string' ||
    !isR2ImagePath(data.imagePath) ||
    typeof data.imageUrl !== 'string'
  ) {
    throw new Error('Image storage returned an invalid upload response.');
  }

  return { imagePath: data.imagePath, imageUrl: data.imageUrl };
}

export async function deleteImagesFromR2(imagePaths: string[]): Promise<void> {
  const supabase = await loadSupabase();
  const paths = imagePaths.filter(isR2ImagePath);
  if (paths.length === 0) return;
  if (!supabase) throw new Error('Supabase is not configured.');

  const { error } = await supabase.functions.invoke(FUNCTION_NAME, {
    body: { action: 'delete', paths },
  });
  if (error) {
    throw new Error(`Unable to remove a product image: ${await getErrorMessage(error)}`);
  }
}
