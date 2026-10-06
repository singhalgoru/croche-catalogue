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
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.resetAllMocks(); });

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

  it('refreshes every minute only while visible and online and cleans up polling', async () => {
    vi.useFakeTimers();
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    vi.mocked(fetchPublishedProducts).mockResolvedValue([product]);
    const { result, unmount } = renderHook(useCatalogueProducts);
    await act(async () => {});
    expect(fetchPublishedProducts).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(59_999); });
    expect(fetchPublishedProducts).toHaveBeenCalledTimes(1);
    const updated = { ...product, price: 250 };
    vi.mocked(fetchPublishedProducts).mockResolvedValue([updated]);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(result.current.products).toEqual([updated]);
    expect(fetchPublishedProducts).toHaveBeenCalledTimes(2);
    visibility.mockReturnValue('hidden');
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(fetchPublishedProducts).toHaveBeenCalledTimes(2);
    visibility.mockReturnValue('visible');
    online.mockReturnValue(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(fetchPublishedProducts).toHaveBeenCalledTimes(2);
    online.mockReturnValue(true);
    await act(async () => { window.dispatchEvent(new Event('online')); });
    expect(fetchPublishedProducts).toHaveBeenCalledTimes(3);
    unmount();
    await vi.advanceTimersByTimeAsync(60_000);
    window.dispatchEvent(new Event('focus'));
    expect(fetchPublishedProducts).toHaveBeenCalledTimes(3);
  });

  it('coalesces focus/visibility events and recovers automatically after an error', async () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    vi.mocked(fetchPublishedProducts).mockRejectedValueOnce(new Error('Offline'));
    const { result } = renderHook(useCatalogueProducts);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.loadError).toBe('Offline');
    let resolve!: (products: Product[]) => void;
    vi.mocked(fetchPublishedProducts).mockImplementation(() => new Promise(done => { resolve = done; }));
    act(() => {
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('online'));
    });
    expect(fetchPublishedProducts).toHaveBeenCalledTimes(2);
    await act(async () => resolve([{ ...product, name: 'Restored bunny' }]));
    expect(result.current.loadError).toBeNull();
    expect(result.current.products[0].name).toBe('Restored bunny');
  });
});
