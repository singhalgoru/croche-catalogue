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

const categorySettingsFromProducts = (products: Product[]) =>
  Array.from(new Set(products.map((product) => product.category))).map(
    (name, index): CategorySettings => ({
      name,
      priority: (index + 1) * 10,
    }),
  );

const loadCatalogue = async () => {
  const [productsResult, categorySettingsResult] = await Promise.allSettled([
    fetchPublishedProducts(),
    fetchCategorySettings(),
  ]);

  const nextProducts =
    productsResult.status === 'fulfilled' ? productsResult.value : localProducts;
  const nextCategorySettings =
    categorySettingsResult.status === 'fulfilled'
      ? categorySettingsResult.value
      : categorySettingsFromProducts(nextProducts);
  const error =
    productsResult.status === 'rejected'
      ? productsResult.reason
      : nextProducts.length === 0 && categorySettingsResult.status === 'rejected'
        ? categorySettingsResult.reason
        : null;

  return {
    products: nextProducts,
    categorySettings: nextCategorySettings,
    error,
  };
};

export function useCatalogueProducts() {
  const [products, setProducts] = useState<Product[]>(localProducts);
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [categorySettings, setCategorySettings] =
    useState<CategorySettings[]>(localCategorySettings);

  const refreshProducts = useCallback(async () => {
    if (!isSupabaseConfigured) return;

    try {
      const result = await loadCatalogue();
      setProducts(result.products);
      setCategorySettings(result.categorySettings);
      setLoadError(
        result.error instanceof Error ? result.error.message : null,
      );
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to load catalogue products.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    let isCurrent = true;
    void loadCatalogue().then(
      (result) => {
        if (!isCurrent) return;
        setProducts(result.products);
        setCategorySettings(result.categorySettings);
        setLoadError(
          result.error instanceof Error ? result.error.message : null,
        );
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
