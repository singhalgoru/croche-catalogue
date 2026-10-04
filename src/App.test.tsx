import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product } from './types/product';
import App from './App';

const product: Product = {
  id: 'test-product', name: 'Test Coaster', category: 'Home', price: 100,
  showPrice: true, description: 'A handmade test coaster.', color: '#ffffff', inStock: true,
  image: '/coaster.webp', variants: [{
    id: 'variant-red', name: 'Red', color: '#ff0000', price: null, inStock: true,
    availableQuantity: 1, image: '/coaster.webp', imagePath: 'coaster.webp', gallery: [],
  }],
};
const addItem = vi.hoisted(() => vi.fn().mockResolvedValue(true));
let catalogueProducts = [product];
vi.mock('virtual:pwa-register/react', () => ({ useRegisterSW: vi.fn() }));
vi.mock('./hooks/useCatalogueProducts', () => ({
  useCatalogueProducts: () => ({
    products: catalogueProducts, categorySettings: [{ name: 'Home', priority: 0 }],
    isLoading: false, loadError: null, refreshProducts: vi.fn(),
  }),
}));
vi.mock('./hooks/useTickerMessages', () => ({ useTickerMessages: () => ['Shipping across India'] }));
vi.mock('./hooks/useCart', () => ({
  useCart: () => ({ itemCount: 0, cartUpdateCount: 0, cart: null, isBusy: false, addItem }),
}));
vi.mock('./services/analytics', () => ({
  trackEvent: vi.fn(), trackProductSelected: vi.fn(), trackProductViewed: vi.fn(),
  trackWhatsAppEnquiry: vi.fn(), trackContactClick: vi.fn(),
}));
vi.mock('./components/ProductGrid', () => ({
  default: ({ onSelect }: { onSelect: (product: Product) => void }) =>
    <button onClick={() => onSelect(product)}>Open test product</button>,
}));

beforeEach(() => {
  catalogueProducts = [product];
  window.history.replaceState(null, '', '/');
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.stubGlobal('scrollTo', vi.fn());
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('Hybrid product navigation', () => {
  it('opens related pages with the same cart and restores the prior page on browser Back', async () => {
    const related = { ...product, id: 'related-product', name: 'Related Coaster' };
    catalogueProducts = [product, related];
    window.history.replaceState(null, '', '/p/test-coaster--test-product/?variant=variant-red&utm_source=instagram');
    render(<App />);
    await screen.findByRole('heading', { name: 'Test Coaster', level: 1 }, { timeout: 5000 });
    fireEvent.click(screen.getByRole('link', { name: /Related Coaster/ }));
    await screen.findByRole('heading', { name: 'Related Coaster', level: 1 });
    expect(window.location.pathname).toBe('/p/related-coaster/');
    expect(window.location.search).not.toContain('variant=');
    expect(window.location.search).toContain('utm_source=instagram');
    fireEvent.click(screen.getByRole('button', { name: 'Add to cart — Related Coaster' }));
    await waitFor(() => expect(addItem).toHaveBeenCalledWith(related, related.variants[0]));
    window.history.back();
    await screen.findByRole('heading', { name: 'Test Coaster', level: 1 });
    expect(window.location.search).toContain('variant=red');
  });

  it('returns directly to the catalogue after following related products from a quick view', async () => {
    catalogueProducts = [product, { ...product, id: 'related-product', name: 'Related Coaster' }];
    render(<App />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search crochet items' }), { target: { value: 'coaster' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open test product' }));
    await screen.findByRole('dialog');
    expect(screen.queryByRole('region', { name: 'More from this collection' })).toBeNull();
    fireEvent.click(screen.getByRole('link', { name: 'View full details' }));
    fireEvent.click(await screen.findByRole('link', { name: /Related Coaster/ }));
    await screen.findByRole('heading', { name: 'Related Coaster', level: 1 });
    fireEvent.click(screen.getByRole('link', { name: 'Back to collection' }));
    await waitFor(() => expect(screen.getByRole('searchbox', { name: 'Search crochet items' })).toHaveProperty('value', 'coaster'));
    expect(window.location.pathname).toBe('/');
  });

  it('opens direct product links as full pages with the existing cart actions', async () => {
    window.history.replaceState(null, '', '/p/old-name--test-product/?variant=variant-red');
    render(<App />);
    expect((await screen.findByRole('heading', { level: 1 }, { timeout: 5000 })).textContent).toBe('Test Coaster');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('link', { name: 'Back to collection' })).toBeTruthy();
    expect(window.location.pathname).toBe('/p/test-coaster/');
    fireEvent.click(screen.getByRole('button', { name: 'Add to cart — Test Coaster' }));
    await waitFor(() => expect(addItem).toHaveBeenCalledWith(product, product.variants[0]));
  });

  it('promotes a catalogue popup to a page and restores catalogue filters on Back', async () => {
    render(<App />);
    const search = screen.getByRole('searchbox', { name: 'Search crochet items' });
    fireEvent.change(search, { target: { value: 'coaster' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open test product' }));
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('link', { name: 'View full details' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Test Coaster');
    expect(window.location.pathname).toBe('/p/test-coaster/');
    fireEvent.click(screen.getByRole('link', { name: 'Back to collection' }));
    await waitFor(() => expect(screen.getByRole('searchbox', { name: 'Search crochet items' })).toHaveProperty('value', 'coaster'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps old homepage hash links as quick-view popups', async () => {
    window.history.replaceState(null, '', '/#product=test-coaster--test-product');
    render(<App />);
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(window.location.pathname).toBe('/');
  });

  it('shows an explicit unavailable message for a missing product', async () => {
    window.history.replaceState(null, '', '/p/missing--unknown/');
    render(<App />);
    expect(screen.getByRole('alert').textContent).toContain('unavailable or no longer published');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('bootstraps a newly published link and replaces its temporary query URL', async () => {
    window.history.replaceState(null, '', '/?productPage=old-name--test-product&variant=variant-red&utm_source=instagram');
    render(<App />);
    await screen.findByRole('heading', { name: 'Test Coaster', level: 1 });
    expect(window.location.pathname).toBe('/p/test-coaster/');
    expect(window.location.search).toContain('variant=red');
    expect(window.location.search).toContain('utm_source=instagram');
    expect(window.location.search).not.toContain('productPage');
  });
});
