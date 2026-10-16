import { loadSupabase } from '../lib/supabaseConfig';
import type { Category, CategoryHotspot, CategorySettings } from '../types/product';
import { compareCategorySettings } from '../utils/categorySelection';
import { countOverviewWords } from '../utils/categoryOverview.js';
import { convertImageForUpload } from '../utils/imageUploadConversion';
import { archiveImageOriginal } from './imageOriginals';
import { deleteImagesFromR2, uploadImageToR2 } from './r2ImageStorage';

interface CategoryRow {
  name: string;
  sort_order: number;
  is_seasonal?: boolean;
  visible?: boolean;
  seasonal_category_products?: { product_id: string }[];
  overview?: string;
  featured_ticker?: boolean;
  cover_image_url?: string;
  image_hotspots?: CategoryHotspot[];
}

declare global {
  interface Window {
    categoriesPrefetch?: Promise<CategoryRow[]>;
  }
}

const requireSupabase = async () => {
  const supabase = await loadSupabase();
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
    );
  }
  return supabase;
};

const readFunctionError = async (error: { message: string; context?: Response }) => {
  let message = error.message;
  if ('context' in error && error.context instanceof Response) {
    const text = await error.context.clone().text();
    try {
      const payload: unknown = JSON.parse(text);
      if (payload && typeof payload === 'object') {
        if ('error' in payload && typeof payload.error === 'string') message = payload.error;
        else if ('message' in payload && typeof payload.message === 'string') message = payload.message;
      }
    } catch {
      // Non-JSON gateway errors retain the SDK message and HTTP status.
    }
    message = `${message} (HTTP ${error.context.status})`;
  }
  return message;
};

const invokeCategoryOverview = async (client: Awaited<ReturnType<typeof requireSupabase>>, name: string) => {
  const { data, error } = await client.functions.invoke('analyze-product', {
    body: { mode: 'category-overview', categoryName: name },
  });
  if (error) {
    throw new Error(`Unable to generate category overview: ${await readFunctionError(error)}`);
  }
  if (data?.error) throw new Error(String(data.error));
  if (typeof data?.overview !== 'string' || !data.overview.trim() || data.overview.length > 2000) {
    throw new Error('AI returned an invalid category overview.');
  }
  return data.overview.trim();
};

export async function fetchCategorySettings(): Promise<CategorySettings[]> {
  const initial = window.categoriesPrefetch;
  window.categoriesPrefetch = undefined;
  let rows: CategoryRow[];
  if (initial) {
    rows = await initial;
  } else {
    const client = await requireSupabase();
    const { data, error } = await client
      .from('categories')
      .select('name, sort_order, is_seasonal, visible, overview, featured_ticker, cover_image_url, image_hotspots, seasonal_category_products(product_id)')
      .order('sort_order')
      .order('name');
    if (error) throw new Error(`Unable to load categories: ${error.message}`);
    rows = data as CategoryRow[];
  }

  return rows.map((category) => ({
    name: category.name,
    priority: category.sort_order,
    isSeasonal: category.is_seasonal ?? false,
    visible: category.visible ?? true,
    productIds: category.seasonal_category_products?.map(item => item.product_id) ?? [],
    overview: category.overview ?? '',
    featuredTicker: category.featured_ticker ?? false,
    coverImage: category.cover_image_url ?? '',
    imageHotspots: category.image_hotspots ?? [],
  })).sort(compareCategorySettings);
}

export async function fetchCategories(): Promise<Category[]> {
  const settings = await fetchCategorySettings();
  return settings.filter(category => !category.isSeasonal).map((category) => category.name);
}

export async function createCategory(name: string, isSeasonal = false): Promise<void> {
  const client = await requireSupabase();
  const normalizedName = name.trim();
  const { error } = await client.from('categories').insert({ name: normalizedName, sort_order: 100, is_seasonal: isSeasonal });

  if (error) {
    throw new Error(
      error.code === '23505'
        ? `The category “${normalizedName}” already exists.`
        : `Unable to create the category: ${error.message}`,
    );
  }

}

export async function uploadSeasonalCategoryImage(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size === 0 || file.size > 6 * 1024 * 1024) {
    throw new Error('Choose a JPG, PNG or WebP cover image no larger than 6 MB.');
  }
  const prepared = await convertImageForUpload(file);
  const imageId = await archiveImageOriginal(file);
  const upload = await uploadImageToR2(prepared, imageId);
  return upload.imageUrl;
}

export async function removeSeasonalCategoryImages(images: string[]): Promise<void> {
  const paths = [...new Set(images.filter(Boolean))].map(image => {
    if (!/^https:\/\/images\.luviacreations\.com\/products\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\.webp$/.test(image)) {
      throw new Error('Unable to remove an invalid seasonal cover image URL.');
    }
    return `r2:${new URL(image).pathname.slice(1, -5)}`;
  });
  await deleteImagesFromR2(paths);
}

export async function saveSeasonalCategory(name: string, productIds: string[], visible: boolean, overview = '', featuredTicker = false, coverImage?: string, imageHotspots?: CategoryHotspot[]): Promise<string> {
  if (imageHotspots !== undefined) return saveCategoryContent(name, overview, coverImage ?? '', imageHotspots, productIds, visible, featuredTicker);
  if (countOverviewWords(overview) > 90) throw new Error('Keep the category overview to 90 words or fewer.');
  const client = await requireSupabase();
  const { data, error } = await client.rpc('save_seasonal_category', {
    category_name: name, selected_product_ids: productIds, show_category: visible,
    category_overview: overview, feature_in_ticker: featuredTicker,
    ...(coverImage !== undefined ? { category_cover_image: coverImage } : {}),
  });
  if (error) throw new Error(`Unable to save seasonal category: ${error.message}`);
  if (typeof data !== 'string') throw new Error('Seasonal category storage returned an invalid save confirmation. Refresh the category before retrying.');
  return data;
}

export async function saveCategoryContent(
  name: string, overview: string, coverImage: string, imageHotspots: CategoryHotspot[],
  productIds: string[] | null = null, visible = true, featuredTicker = false,
): Promise<string> {
  if (countOverviewWords(overview) > 90) throw new Error('Keep the category overview to 90 words or fewer.');
  if (imageHotspots.length > 6 || imageHotspots.some(spot => !spot.productId
    || !Number.isFinite(spot.x) || !Number.isFinite(spot.y)
    || spot.x < 0 || spot.x > 100 || spot.y < 0 || spot.y > 100)) {
    throw new Error('Use up to six hotspots with a product and coordinates between 0 and 100.');
  }
  if (!coverImage && imageHotspots.length) throw new Error('Upload a category image before adding hotspots.');
  const client = await requireSupabase();
  const { data, error } = await client.rpc('save_category_content', {
    category_name: name, category_overview: overview, category_cover_image: coverImage,
    category_hotspots: imageHotspots, selected_product_ids: productIds,
    show_category: visible, feature_in_ticker: featuredTicker,
  });
  if (error) throw new Error(`Unable to save category content: ${error.message}`);
  if (typeof data !== 'string') throw new Error('Category storage returned an invalid save confirmation. Refresh before retrying.');
  return data;
}
export async function saveCategoryOverview(name: string, overview: string): Promise<void> {
  if (countOverviewWords(overview) > 90) throw new Error('Keep the category overview to 90 words or fewer.');
  const client = await requireSupabase();
  const { error } = await client.from('categories').update({ overview }).eq('name', name);
  if (error) throw new Error(`Unable to save category overview: ${error.message}`);
}

export async function generateCategoryOverview(name: string): Promise<string> {
  const client = await requireSupabase();
  return invokeCategoryOverview(client, name);
}

export async function renameCategory(currentName: string, replacementName: string): Promise<void> {
  const client = await requireSupabase();
  const { error } = await client.rpc('rename_catalogue_category', {
    current_name: currentName,
    replacement_name: replacementName.trim(),
  });

  if (error) {
    throw new Error(`Unable to rename the category: ${error.message}`);
  }
}

export async function deleteCategory(name: string): Promise<void> {
  const client = await requireSupabase();
  const { error } = await client.from('categories').delete().eq('name', name);

  if (error) {
    throw new Error(
      error.code === '23503'
        ? `“${name}” is still assigned to one or more products. Move those products to another category before deleting it.`
        : `Unable to delete the category: ${error.message}`,
    );
  }
}

export async function updateCategoryPresentation(
  name: string,
  priority: number,
): Promise<void> {
  const client = await requireSupabase();
  const { error } = await client.rpc('update_catalogue_category_priority', {
    category_name: name,
    category_priority: priority,
  });

  if (error) {
    throw new Error(`Unable to update category display settings: ${error.message}`);
  }
}
