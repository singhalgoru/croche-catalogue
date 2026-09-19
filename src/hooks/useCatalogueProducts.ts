import { useCallback, useEffect, useState } from 'react';
import { products as localProducts } from '../data/products';
import { isSupabaseConfigured } from '../lib/supabase';
import { fetchPublishedProducts } from '../services/products';
import type { Product } from '../types/product';

export function useCatalogueProducts() {
  const [products, setProducts] = useState<Product[]>(localProducts);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refreshProducts = useCallback(async () => {
    if (!isSupabaseConfigured) return;

    try {
      const uploadedProducts = await fetchPublishedProducts();
      setProducts([...uploadedProducts, ...localProducts]);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to load uploaded products.');
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    let isCurrent = true;
    void fetchPublishedProducts().then(
      (uploadedProducts) => {
        if (!isCurrent) return;
        setProducts([...uploadedProducts, ...localProducts]);
        setLoadError(null);
      },
      (error: unknown) => {
        if (!isCurrent) return;
        setLoadError(error instanceof Error ? error.message : 'Unable to load uploaded products.');
      },
    );

    return () => {
      isCurrent = false;
    };
  }, []);

  return { products, loadError, refreshProducts };
}
