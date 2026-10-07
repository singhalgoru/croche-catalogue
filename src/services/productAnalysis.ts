import { supabase } from '../lib/supabase';
import type { Category, ProductDetails } from '../types/product';

export interface ProductAnalysis extends ProductDetails {
  seoDescription: string;
  name: string;
  category: Category;
  description: string;
  color: string;
}

export interface ProductAnalysisContext extends ProductDetails {
  notes?: string;
  name?: string;
  category?: Category;
  description?: string;
}

export interface ProductGstRateSuggestion {
  source: string;
  candidates: Array<{
    hsnCode: string;
    hsnDescription: string;
    gstRate: number;
    igstRate: number | null;
    cgstRate: number;
    sgstRate: number;
    cessRate: number;
    confidence: number;
    notificationRef: string | null;
    conditionApplied: string | null;
    conditionWarning: string | null;
    needsReview: boolean;
  }>;
}

const CONTEXT_LIMITS = {
  notes: 2000,
  name: 120,
  category: 120,
  description: 2000,
  seoDescription: 160,
  materials: 1000,
  dimensions: 1000,
  includedItems: 1000,
  careInstructions: 1000,
} as const;
const DETAIL_FIELDS = ['materials', 'dimensions', 'includedItems', 'careInstructions'] as const;

const validateContext = (context: ProductAnalysisContext): ProductAnalysisContext => {
  const normalized: ProductAnalysisContext = {};
  for (const field of Object.keys(CONTEXT_LIMITS) as Array<keyof typeof CONTEXT_LIMITS>) {
    const value = context[field];
    if (value === undefined) continue;
    if (typeof value !== 'string' || value.length > CONTEXT_LIMITS[field]) {
      throw new Error(`Analysis ${field} must be text of at most ${CONTEXT_LIMITS[field]} characters.`);
    }
    normalized[field] = value.trim();
  }
  return normalized;
};

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

  const details: ProductDetails = {};
  if (typeof analysis.seoDescription !== 'string' ||
      !analysis.seoDescription.trim() || analysis.seoDescription.length > 160 ||
      !/[.!?]$/.test(analysis.seoDescription.trim()) ||
      /[<>]|\u2026|\.{3}/.test(analysis.seoDescription)) {
    throw new Error('Gemini returned an invalid SEO description. Use a complete plain-text sentence of at most 160 characters.');
  }
  for (const field of DETAIL_FIELDS) {
    const value = analysis[field];
    if (value === undefined) continue;
    if (typeof value !== 'string' || value.length > 1000) {
      throw new Error('Gemini returned invalid optional product details.');
    }
    details[field] = value.trim();
  }

  return {
    name: analysis.name.trim(),
    category: analysis.category,
    description: analysis.description.trim(),
    seoDescription: analysis.seoDescription.trim(),
    color: analysis.color,
    ...details,
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

export async function suggestProductGstRate(
  context: ProductAnalysisContext,
): Promise<ProductGstRateSuggestion> {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
    );
  }
  const normalizedContext = validateContext(context);
  if (!normalizedContext.category) {
    throw new Error('Choose a product category before requesting a GST suggestion.');
  }

  const { data, error } = await supabase.functions.invoke('analyze-product', {
    body: { mode: 'gst-rate', context: normalizedContext },
  });
  if (error) {
    const message = await getFunctionErrorMessage(error);
    throw new Error(`Unable to suggest a GST rate: ${message}`);
  }
  if (!data || typeof data !== 'object' || !('source' in data) ||
    typeof data.source !== 'string' || !data.source.trim() ||
    !('candidates' in data) || !Array.isArray(data.candidates) ||
    data.candidates.length === 0 || data.candidates.length > 5) {
    throw new Error('GST Accelerator returned an invalid HSN lookup.');
  }

  const candidates = data.candidates.map((candidate: unknown) => {
    if (!candidate || typeof candidate !== 'object') {
      throw new Error('The HSN provider returned an invalid classification.');
    }
    const item = candidate as Record<string, unknown>;
    const validRate = (rate: unknown) =>
      typeof rate === 'number' && Number.isFinite(rate) && rate >= 0 && rate <= 100;
    if (
      typeof item.hsnCode !== 'string' || !/^\d{4}(?:\d{2}){0,2}$/.test(item.hsnCode) ||
      typeof item.hsnDescription !== 'string' || !item.hsnDescription.trim() ||
      !validRate(item.gstRate) ||
      (item.igstRate !== null && !validRate(item.igstRate)) || !validRate(item.cgstRate) ||
      !validRate(item.sgstRate) || !validRate(item.cessRate) ||
      typeof item.confidence !== 'number' || item.confidence < 0 || item.confidence > 1 ||
      (item.notificationRef !== null && typeof item.notificationRef !== 'string') ||
      (item.conditionApplied !== null && typeof item.conditionApplied !== 'string') ||
      (item.conditionWarning !== null && typeof item.conditionWarning !== 'string') ||
      typeof item.needsReview !== 'boolean'
    ) {
      throw new Error('The HSN provider returned an invalid classification.');
    }
    return item as ProductGstRateSuggestion['candidates'][number];
  });

  return { source: data.source, candidates };
}

/** Context is draft-only; notes are limited to 2,000 characters and details to 1,000 each. */
export async function analyzeProductImage(
  file: File,
  categories: Category[],
  context?: ProductAnalysisContext,
  mode?: 'descriptions',
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

  const normalizedContext = context === undefined ? undefined : validateContext(context);
  const imageBase64 = await fileToBase64(file);
  const { data, error } = await supabase.functions.invoke('analyze-product', {
    body: {
      imageBase64,
      mimeType: file.type,
      ...(mode === undefined ? {} : { mode }),
      ...(normalizedContext === undefined ? {} : { context: normalizedContext }),
    },
  });

  if (error) {
    const message = await getFunctionErrorMessage(error);
    throw new Error(`Unable to analyze the product image: ${message}`);
  }

  return validateAnalysis(data, categories);
}

export interface VariantNameSuggestion {
  name: string;
  color: string;
}

export interface VariantNameContext {
  productName?: string;
  existingVariantNames?: string[];
}

const validateVariantSuggestion = (
  value: unknown,
  existingVariantNames: string[],
): VariantNameSuggestion => {
  if (!value || typeof value !== 'object') {
    throw new Error('Gemini returned an invalid variant name suggestion.');
  }

  const suggestion = value as Record<string, unknown>;
  const name = typeof suggestion.name === 'string' ? suggestion.name.trim().slice(0, 60) : '';
  if (!name || typeof suggestion.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(suggestion.color)) {
    throw new Error('Gemini returned an incomplete variant name suggestion.');
  }

  const taken = new Set(existingVariantNames.map((existing) => existing.trim().toLowerCase()));
  if (taken.has(name.toLowerCase())) {
    throw new Error(`Gemini suggested “${name}”, which is already used. Try again or type a name.`);
  }

  return { name, color: suggestion.color.toLowerCase() };
};

export async function suggestVariantName(
  file: File,
  context: VariantNameContext = {},
): Promise<VariantNameSuggestion> {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
    );
  }

  if (!file.type.startsWith('image/')) {
    throw new Error('Please select an image file.');
  }

  if (file.size > MAX_ANALYSIS_FILE_SIZE) {
    throw new Error('Please use an image smaller than 6 MB for AI naming.');
  }

  const existingVariantNames = (context.existingVariantNames ?? [])
    .map((name) => name.trim())
    .filter(Boolean);
  const imageBase64 = await fileToBase64(file);
  const { data, error } = await supabase.functions.invoke('analyze-product', {
    body: {
      mode: 'variant-name',
      imageBase64,
      mimeType: file.type,
      productName: context.productName?.trim() ?? '',
      existingVariantNames,
    },
  });

  if (error) {
    const message = await getFunctionErrorMessage(error);
    throw new Error(`Unable to suggest a variant name: ${message}`);
  }

  return validateVariantSuggestion(data, existingVariantNames);
}
