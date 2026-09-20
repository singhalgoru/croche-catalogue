import { supabase } from '../lib/supabase';

export type ProductImageMode = 'studio' | 'lifestyle';

interface GeneratedImagePayload {
  imageBase64: string;
  mimeType: string;
}

const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The selected image could not be read.'));
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('The selected image could not be prepared for generation.'));
        return;
      }
      const encoded = reader.result.split(',')[1];
      if (!encoded) {
        reject(new Error('The selected image did not contain valid image data.'));
        return;
      }
      resolve(encoded);
    };
    reader.readAsDataURL(file);
  });

const getFunctionErrorMessage = async (error: { message: string; context?: unknown }) => {
  if (error.context instanceof Response) {
    try {
      const payload: unknown = await error.context.clone().json();
      if (
        payload &&
        typeof payload === 'object' &&
        'error' in payload &&
        typeof payload.error === 'string'
      ) {
        return payload.error;
      }
    } catch {
      // Use the SDK error when the response is not JSON.
    }
  }
  return error.message;
};

const base64ToFile = (base64: string, mimeType: string, mode: ProductImageMode) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType.split('/')[1] || 'png';
  return new File([bytes], `luvia-${mode}-${Date.now()}.${extension}`, { type: mimeType });
};

export async function generateProductImage(
  file: File,
  mode: ProductImageMode,
  styleSuggestion?: string,
): Promise<File> {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
    );
  }
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Please choose a JPG, PNG, or WebP image.');
  }
  if (file.size > 6 * 1024 * 1024) {
    throw new Error('Please choose an image smaller than 6 MB.');
  }

  const imageBase64 = await fileToBase64(file);
  const { data, error } = await supabase.functions.invoke('enhance-product-image', {
    body: {
      imageBase64,
      mimeType: file.type,
      mode,
      styleSuggestion: styleSuggestion?.trim() || undefined,
    },
  });
  if (error) {
    const message = await getFunctionErrorMessage(error);
    throw new Error(`Unable to create the ${mode} image: ${message}`);
  }

  const payload = data as Partial<GeneratedImagePayload>;
  if (
    typeof payload.imageBase64 !== 'string' ||
    typeof payload.mimeType !== 'string' ||
    !payload.mimeType.startsWith('image/')
  ) {
    throw new Error('The image service did not return a valid generated image.');
  }

  const generatedFile = base64ToFile(payload.imageBase64, payload.mimeType, mode);
  if (generatedFile.size > 6 * 1024 * 1024) {
    throw new Error('The generated image is larger than 6 MB. Try again.');
  }
  return generatedFile;
}
