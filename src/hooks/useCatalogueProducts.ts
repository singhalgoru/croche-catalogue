import { useCallback, useEffect, useRef, useState } from 'react';
import { products as localProducts } from '../data/products';
import { isSupabaseConfigured } from '../lib/supabaseConfig';
import { fetchCategorySettings } from '../services/categories';
import { fetchPublishedProducts, readCatalogueBootstrap } from '../services/products';
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

const loadCatalogue = async (fallbackProducts: Product[], fallbackCategories: CategorySettings[]) => {
  const [productsResult, categorySettingsResult] = await Promise.allSettled([
    fetchPublishedProducts(),
    fetchCategorySettings(),
  ]);

  const nextProducts =
    productsResult.status === 'fulfilled' ? productsResult.value : fallbackProducts;
  const nextCategorySettings =
    categorySettingsResult.status === 'fulfilled'
      ? categorySettingsResult.value
      : productsResult.status === 'rejected' ? fallbackCategories : categorySettingsFromProducts(nextProducts);
  const error =
    productsResult.status === 'rejected'
      ? productsResult.reason
      : categorySettingsResult.status === 'rejected'
        ? categorySettingsResult.reason
        : null;

  return {
    products: nextProducts,
    categorySettings: nextCategorySettings,
    error,
  };
};

export function useCatalogueProducts() {
  const [bootstrap] = useState(readCatalogueBootstrap);
  const initialProducts = bootstrap?.products ?? localProducts;
  const initialCategories = bootstrap?.categories ?? localCategorySettings;
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [categorySettings, setCategorySettings] =
    useState<CategorySettings[]>(initialCategories);
  const latestCatalogue = useRef({ products: initialProducts, categorySettings: initialCategories });
  const active = useRef(false);
  const pendingRefresh = useRef<Promise<void> | null>(null);

  const refreshProducts = useCallback((): Promise<void> => {
    if (!isSupabaseConfigured) return Promise.resolve();
    if (pendingRefresh.current) return pendingRefresh.current;
    pendingRefresh.current = (async () => {
      try {
        const result = await loadCatalogue(latestCatalogue.current.products, latestCatalogue.current.categorySettings);
        if (!active.current) return;
        latestCatalogue.current = { products: result.products, categorySettings: result.categorySettings };
        setProducts(result.products);
        setCategorySettings(result.categorySettings);
        setLoadError(result.error instanceof Error ? result.error.message : result.error ? 'Unable to load catalogue products.' : null);
      } catch (error) {
        if (active.current) setLoadError(error instanceof Error ? error.message : 'Unable to load catalogue products.');
      } finally {
        if (active.current) setIsLoading(false);
        pendingRefresh.current = null;
      }
    })();
    return pendingRefresh.current;
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    active.current = true;
    void refreshProducts();
    const refreshVisible = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) void refreshProducts();
    };
    window.addEventListener('focus', refreshVisible);
    window.addEventListener('online', refreshVisible);
    document.addEventListener('visibilitychange', refreshVisible);
    const timer = window.setInterval(refreshVisible, 60_000);
    return () => {
      active.current = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshVisible);
      window.removeEventListener('online', refreshVisible);
      document.removeEventListener('visibilitychange', refreshVisible);
    };
  }, [refreshProducts]);

  return { products, categorySettings, isLoading, loadError, refreshProducts,
    hasCatalogueSnapshot: bootstrap !== null, homepageMetadata: bootstrap?.homepage };
}
