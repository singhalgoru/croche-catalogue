import { loadSupabase } from '../lib/supabaseConfig';
import { createResizedWebp } from '../utils/imageUploadConversion';
import { R2_IMAGE_WIDTHS } from '../utils/productImageUrl';

export const R2_IMAGE_PATH_PREFIX = 'r2:';
const FUNCTION_NAME = 'r2-images';

export interface StoredImage {
  imagePath: string;
  imageUrl: string;
}

// Set once the Edge Function reports R2 is not set up, so later uploads in
// the same session go straight to Supabase Storage.
let r2Unavailable = false;

export const resetR2AvailabilityForTests = () => {
  r2Unavailable = false;
};

export const isR2ImagePath = (imagePath: string) => imagePath.startsWith(R2_IMAGE_PATH_PREFIX);

const getHttpStatus = (error: { context?: unknown }) =>
  error.context instanceof Response ? error.context.status : undefined;

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
 * Returns null when R2 is not configured so callers can use Supabase Storage.
 */
export async function uploadImageToR2(file: File): Promise<StoredImage | null> {
  const supabase = await loadSupabase();
  if (!supabase || r2Unavailable) return null;

  const form = new FormData();
  form.append('full', file, 'full.webp');
  for (const width of R2_IMAGE_WIDTHS) {
    form.append(`w${width}`, await createResizedWebp(file, width), `w${width}.webp`);
  }

  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, { body: form });
  if (error) {
    const status = getHttpStatus(error);
    // 404: function not deployed; 501: deployed without R2 secrets;
    // no status: the function could not be reached at all.
    if (status === undefined || status === 404 || status === 501) {
      r2Unavailable = true;
      return null;
    }
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
