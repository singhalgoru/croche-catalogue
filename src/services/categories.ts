import { supabase } from '../lib/supabase';
import type { Category, CategorySettings } from '../types/product';

interface CategoryRow {
  name: string;
  sort_order: number;
}

const requireSupabase = () => {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
    );
  }
  return supabase;
};

export async function fetchCategorySettings(): Promise<CategorySettings[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('categories')
    .select('name, sort_order')
    .order('sort_order')
    .order('name');

  if (error) {
    throw new Error(`Unable to load categories: ${error.message}`);
  }

  return (data as CategoryRow[]).map((category) => ({
    name: category.name,
    priority: category.sort_order,
  }));
}

export async function fetchCategories(): Promise<Category[]> {
  const settings = await fetchCategorySettings();
  return settings.map((category) => category.name);
}

export async function createCategory(name: string): Promise<void> {
  const client = requireSupabase();
  const normalizedName = name.trim();
  const { error } = await client.from('categories').insert({ name: normalizedName, sort_order: 100 });

  if (error) {
    throw new Error(
      error.code === '23505'
        ? `The category “${normalizedName}” already exists.`
        : `Unable to create the category: ${error.message}`,
    );
  }
}

export async function renameCategory(currentName: string, replacementName: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc('rename_catalogue_category', {
    current_name: currentName,
    replacement_name: replacementName.trim(),
  });

  if (error) {
    throw new Error(`Unable to rename the category: ${error.message}`);
  }
}

export async function deleteCategory(name: string): Promise<void> {
  const client = requireSupabase();
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
  const client = requireSupabase();
  const { error } = await client.rpc('update_catalogue_category_priority', {
    category_name: name,
    category_priority: priority,
  });

  if (error) {
    throw new Error(`Unable to update category display settings: ${error.message}`);
  }
}
