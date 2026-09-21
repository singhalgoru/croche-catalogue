import { useCallback, useEffect, useState } from 'react';
import { products as localProducts } from '../data/products';
import { isSupabaseConfigured } from '../lib/supabase';
import { fetchCategorySettings } from '../services/categories';
import { fetchPublishedProducts } from '../services/products';
import type { CategorySettings, Product } from '../types/product';

const localCategorySettings = Array.from(
  new Set(localProducts.map((product) => product.category)),
).map((name, index): CategorySettings => ({
  name,
  priority: (index + 1) * 10,
}));

export function useCatalogueProducts() {
  const [products, setProducts] = useState<Product[]>(
    isSupabaseConfigured ? [] : localProducts,
  );
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [categorySettings, setCategorySettings] = useState<CategorySettings[]>(
    isSupabaseConfigured ? [] : localCategorySettings,
  );

  const refreshProducts = useCallback(async () => {
    if (!isSupabaseConfigured) return;

    try {
      const [managedProducts, nextCategorySettings] = await Promise.all([
        fetchPublishedProducts(),
        fetchCategorySettings(),
      ]);
      setProducts(managedProducts);
      setCategorySettings(nextCategorySettings);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to load catalogue products.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    let isCurrent = true;
    void Promise.all([fetchPublishedProducts(), fetchCategorySettings()]).then(
      ([managedProducts, nextCategorySettings]) => {
        if (!isCurrent) return;
        setProducts(managedProducts);
        setCategorySettings(nextCategorySettings);
        setLoadError(null);
        setIsLoading(false);
      },
      (error: unknown) => {
        if (!isCurrent) return;
        setLoadError(error instanceof Error ? error.message : 'Unable to load catalogue products.');
        setIsLoading(false);
      },
    );

    return () => {
      isCurrent = false;
    };
  }, []);

  return { products, categorySettings, isLoading, loadError, refreshProducts };
}
