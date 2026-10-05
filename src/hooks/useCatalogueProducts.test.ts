import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCatalogueProducts } from './useCatalogueProducts';
import { fetchPublishedProducts, readCatalogueBootstrap } from '../services/products';
import { fetchCategorySettings } from '../services/categories';
import type { Product } from '../types/product';

vi.mock('../lib/supabaseConfig', () => ({ isSupabaseConfigured: true }));
vi.mock('../services/products', () => ({ fetchPublishedProducts: vi.fn(), readCatalogueBootstrap: vi.fn() }));
vi.mock('../services/categories', () => ({ fetchCategorySettings: vi.fn() }));
const product: Product = {
  id: 'live-product', name: 'Bunny', category: 'Toys', description: 'Handmade bunny.',
  price: 100, color: '#ffffff', inStock: true, image: '/bunny.webp', variants: [],
};
const categories = [{ name: 'Toys', priority: 10 }];
const homepage = { title: 'Catalogue', description: 'Catalogue summary.', canonical: 'https://luviacreations.com/' };
beforeEach(() => {
  vi.mocked(readCatalogueBootstrap).mockReturnValue({ products: [product], categories, homepage });
  vi.mocked(fetchCategorySettings).mockResolvedValue(categories);
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe('initial catalogue snapshot', () => {
  it('provides built products and categories immediately while awaiting live data', async () => {
    let resolve: (products: Product[]) => void = () => {};
    vi.mocked(fetchPublishedProducts).mockImplementation(() => new Promise(done => { resolve = done; }));
    const { result } = renderHook(useCatalogueProducts);
    expect(result.current.products).toEqual([product]);
    expect(result.current.categorySettings).toEqual(categories);
    expect(result.current.hasCatalogueSnapshot).toBe(true);
    expect(result.current.isLoading).toBe(true);
    const live = { ...product, name: 'Updated bunny' };
    await act(async () => resolve([live]));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.products).toEqual([live]);
    expect(result.current.homepageMetadata).toEqual(homepage);
  });

  it('retains the snapshot and surfaces errors if live requests fail', async () => {
    vi.mocked(fetchPublishedProducts).mockRejectedValue(new Error('Catalogue network failure'));
    vi.mocked(fetchCategorySettings).mockRejectedValue(new Error('Category network failure'));
    const { result } = renderHook(useCatalogueProducts);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.products).toEqual([product]);
    expect(result.current.categorySettings).toEqual(categories);
    expect(result.current.loadError).toBe('Catalogue network failure');
  });

  it('shows category errors instead of silently dropping them', async () => {
    vi.mocked(fetchPublishedProducts).mockResolvedValue([product]);
    vi.mocked(fetchCategorySettings).mockRejectedValue(new Error('Category network failure'));
    const { result } = renderHook(useCatalogueProducts);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.loadError).toBe('Category network failure');
    expect(result.current.products).toEqual([product]);
  });

  it('preserves successfully loaded products when a later refresh fails', async () => {
    const live = { ...product, name: 'Updated bunny' };
    vi.mocked(fetchPublishedProducts).mockResolvedValueOnce([live]).mockRejectedValueOnce(new Error('Refresh failed'));
    const { result } = renderHook(useCatalogueProducts);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => { await result.current.refreshProducts(); });
    expect(result.current.products).toEqual([live]);
    expect(result.current.loadError).toBe('Refresh failed');
  });
});
