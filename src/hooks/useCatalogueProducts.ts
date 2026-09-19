import { useCallback, useEffect, useState } from 'react';
import { products as localProducts } from '../data/products';
import { isSupabaseConfigured } from '../lib/supabase';
import { fetchPublishedProducts } from '../services/products';
import type { Product } from '../types/product';

export function useCatalogueProducts() {
  const [products, setProducts] = useState<Product[]>(
    isSupabaseConfigured ? [] : localProducts,
  );
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refreshProducts = useCallback(async () => {
    if (!isSupabaseConfigured) return;

    try {
      const managedProducts = await fetchPublishedProducts();
      setProducts(managedProducts);
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
    void fetchPublishedProducts().then(
      (managedProducts) => {
        if (!isCurrent) return;
        setProducts(managedProducts);
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

  return { products, isLoading, loadError, refreshProducts };
}
