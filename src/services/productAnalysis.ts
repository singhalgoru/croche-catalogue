import { supabase } from '../lib/supabase';
import type { Category } from '../types/product';

export interface ProductAnalysis {
  name: string;
  category: Category;
  description: string;
  color: string;
}

const MAX_ANALYSIS_FILE_SIZE = 6 * 1024 * 1024;

const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The selected image could not be read.'));
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('The selected image could not be converted for analysis.'));
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

const validateAnalysis = (value: unknown, categories: Category[]): ProductAnalysis => {
  if (!value || typeof value !== 'object') {
    throw new Error('Gemini returned an invalid product analysis.');
  }

  const analysis = value as Record<string, unknown>;
  if (
    typeof analysis.name !== 'string' ||
    typeof analysis.category !== 'string' ||
    !categories.includes(analysis.category) ||
    typeof analysis.description !== 'string' ||
    typeof analysis.color !== 'string' ||
    !/^#[0-9a-fA-F]{6}$/.test(analysis.color)
  ) {
    throw new Error('Gemini returned incomplete or invalid product details.');
  }

  return {
    name: analysis.name.trim(),
    category: analysis.category,
    description: analysis.description.trim(),
    color: analysis.color,
  };
};

const getFunctionErrorMessage = async (error: {
  message: string;
  context?: unknown;
}): Promise<string> => {
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
      // Fall back to the SDK message when the response is not JSON.
    }
  }

  return error.message;
};

export async function analyzeProductImage(
  file: File,
  categories: Category[],
): Promise<ProductAnalysis> {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
    );
  }

  if (!file.type.startsWith('image/')) {
    throw new Error('Please select an image file.');
  }

  if (file.size > MAX_ANALYSIS_FILE_SIZE) {
    throw new Error('Please use an image smaller than 6 MB for AI analysis.');
  }

  if (categories.length === 0) {
    throw new Error('Create at least one product category before running AI analysis.');
  }

  const imageBase64 = await fileToBase64(file);
  const { data, error } = await supabase.functions.invoke('analyze-product', {
    body: {
      imageBase64,
      mimeType: file.type,
    },
  });

  if (error) {
    const message = await getFunctionErrorMessage(error);
    throw new Error(`Unable to analyze the product image: ${message}`);
  }

  return validateAnalysis(data, categories);
}
