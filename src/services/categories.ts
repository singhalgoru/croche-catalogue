import { loadSupabase } from '../lib/supabaseConfig';
import type { Category, CategorySettings } from '../types/product';

interface CategoryRow {
  name: string;
  sort_order: number;
  is_seasonal?: boolean;
  visible?: boolean;
  seasonal_category_products?: { product_id: string }[];
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
      .select('name, sort_order, is_seasonal, visible, seasonal_category_products(product_id)')
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
  }));
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

export async function saveSeasonalCategory(name: string, productIds: string[], visible: boolean): Promise<void> {
  const client = await requireSupabase();
  const { error } = await client.rpc('save_seasonal_category', {
    category_name: name, selected_product_ids: productIds, show_category: visible,
  });
  if (error) throw new Error(`Unable to save seasonal category: ${error.message}`);
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
