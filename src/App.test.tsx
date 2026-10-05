import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
let catalogueLoading = false;
let catalogueSnapshot = false;
vi.mock('virtual:pwa-register/react', () => ({ useRegisterSW: vi.fn() }));
vi.mock('./hooks/useCatalogueProducts', () => ({
  useCatalogueProducts: () => ({
    products: catalogueProducts, categorySettings: [{ name: 'Home', priority: 0 }],
    isLoading: catalogueLoading, loadError: null, refreshProducts: vi.fn(),
    hasCatalogueSnapshot: catalogueSnapshot,
    homepageMetadata: { title: 'Catalogue', description: 'Catalogue summary.', canonical: 'https://luviacreations.com/' },
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
  default: ({ onSelect, products }: { onSelect: (product: Product) => void; products: Product[] }) =>
    <div>
      <button onClick={() => onSelect(product)}>Open test product</button>
      <output aria-label="Filtered products">{products.map((item) => item.name).join(', ')}</output>
    </div>,
}));

beforeEach(() => {
  catalogueProducts = [product];
  catalogueLoading = false;
  catalogueSnapshot = false;
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
  it('shows snapshot product details immediately and replaces them with live copy without losing the page', async () => {
    catalogueSnapshot = true;
    catalogueLoading = true;
    window.history.replaceState(null, '', '/p/test-coaster/');
    const view = render(<App />);
    await screen.findByRole('heading', { name: 'Test Coaster', level: 1 });
    expect(screen.queryByText('Loading product details…')).toBeNull();
    catalogueProducts = [{ ...product, description: 'Fresh product description.', image: '/fresh.webp',
      variants: [{ ...product.variants[0], image: '/fresh.webp' }] }];
    catalogueLoading = false;
    view.rerender(<App />);
    await screen.findByText('Fresh product description.');
    expect(screen.getByRole('img', { name: 'Test Coaster' }).getAttribute('src')).toBe('/fresh.webp');
  });

  it('removes snapshot details when live data confirms that the product is no longer published', async () => {
    catalogueSnapshot = true;
    catalogueLoading = true;
    window.history.replaceState(null, '', '/p/test-coaster/');
    const view = render(<App />);
    await screen.findByRole('heading', { name: 'Test Coaster', level: 1 });
    catalogueProducts = [];
    catalogueLoading = false;
    view.rerender(<App />);
    expect(screen.getByRole('alert').textContent).toContain('no longer published');
    expect(screen.queryByRole('heading', { name: 'Test Coaster', level: 1 })).toBeNull();
  });

  it('displays a built catalogue while live data loads instead of the loading screen', () => {
    catalogueLoading = true;
    catalogueSnapshot = true;
    render(<App />);
    expect(screen.queryByText('Loading the catalogue…')).toBeNull();
    expect(screen.getByLabelText('Filtered products').textContent).toBe('Test Coaster');
    expect(screen.getAllByRole('button', { name: 'Home' }).length).toBeGreaterThan(0);
  });

  it('returns home from a direct product page without navigation reload and restores homepage metadata', async () => {
    window.history.replaceState(null, '', '/p/test-coaster/');
    render(<App />);
    await screen.findByRole('heading', { name: 'Test Coaster', level: 1 });
    fireEvent.click(screen.getByRole('link', { name: 'Luvia Creations — home' }));
    expect(window.location.pathname).toBe('/');
    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).toBeNull();
    expect(screen.getByLabelText('Filtered products').textContent).toBe('Test Coaster');
    expect(document.title).toBe('Catalogue');
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Main navigation' }))
      .getAllByRole('link', { name: 'Home' })[0]);
    expect(window.location.pathname).toBe('/');
  });

  it('shows linked breadcrumbs only on full product pages', async () => {
    window.history.replaceState(null, '', '/p/test-coaster/');
    render(<App />);
    const breadcrumb = within(await screen.findByRole('navigation', { name: 'Breadcrumb' }));
    const links = breadcrumb.getAllByRole('link');
    expect(links[0].textContent).toBe('Home');
    expect(links[0].getAttribute('href')).toBe('/');
    expect(links[1].getAttribute('href')).toBe('/?category=Home');
    expect(breadcrumb.getByText('Test Coaster').getAttribute('aria-current')).toBe('page');
  });

  it('opens category URLs with the matching catalogue filter', () => {
    catalogueProducts = [product, { ...product, id: 'toy', name: 'Bunny Toy', category: 'Toys' }];
    window.history.replaceState(null, '', '/?category=Home');
    render(<App />);
    expect(screen.getByLabelText('Filtered products').textContent).toBe('Test Coaster');
    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).toBeNull();
  });

  it('uses the full collection for an unavailable category URL', () => {
    window.history.replaceState(null, '', '/?category=Unknown');
    render(<App />);
    expect(screen.getByLabelText('Filtered products').textContent).toBe('Test Coaster');
  });

  it.each([undefined, 'Handmade cotton crochet coaster with scalloped edges.'])(
    'keeps search and social descriptions consistent with custom SEO or automatic summaries (%s)',
    async (seoDescription) => {
      const metas = [
        ['name', 'description'],
        ['property', 'og:description'],
        ['name', 'twitter:description'],
      ].map(([attribute, value]) => {
        const meta = document.createElement('meta');
        meta.setAttribute(attribute, value);
        meta.content = 'Original catalogue summary.';
        document.head.append(meta);
        return meta;
      });
      try {
        catalogueProducts = [{
          ...product,
          description: `${'Long product description '.repeat(20)}.`,
          seoDescription,
        }];
        window.history.replaceState(null, '', '/p/test-coaster/');
        render(<App />);
        await screen.findByRole('heading', { name: 'Test Coaster', level: 1 });
        for (const meta of metas) {
          expect(meta.content).toBe(seoDescription ??
            "Test Coaster: handmade crochet from Luvia Creations' Home collection. Shipped across India.");
        }
      } finally {
        metas.forEach((meta) => meta.remove());
      }
    },
  );

  it('waits for the live catalogue before resolving a direct product link', async () => {
    const staleProduct: Product = {
      ...product,
      id: 'p29',
      name: 'Lilac Ruffle Scrunchie',
      image: '/images/processed/scrunchie-lilac-ruffle.jpg',
      variants: [{
        ...product.variants[0],
        id: 'p29-default',
        image: '/images/processed/scrunchie-lilac-ruffle.jpg',
      }],
    };
    const liveProduct: Product = {
      ...staleProduct,
      id: 'live-lilac-scrunchie',
      publicSlug: 'lilac-ruffle-scrunchie',
      image: 'https://images.luviacreations.com/products/lilac-ruffle-scrunchie.webp',
      variants: [{
        ...staleProduct.variants[0],
        id: 'live-lilac-variant',
        image: 'https://images.luviacreations.com/products/lilac-ruffle-scrunchie.webp',
      }],
    };
    catalogueProducts = [staleProduct];
    catalogueLoading = true;
    window.history.replaceState(null, '', '/p/lilac-ruffle-scrunchie/');
    const { rerender } = render(<App />);

    expect(screen.getByRole('status').textContent).toContain('Loading product details');

    catalogueProducts = [liveProduct];
    catalogueLoading = false;
    rerender(<App />);

    await screen.findByRole('heading', { name: 'Lilac Ruffle Scrunchie', level: 1 });
    expect(screen.getByRole('img', { name: 'Lilac Ruffle Scrunchie' }).getAttribute('src'))
      .toBe('https://images.luviacreations.com/products/lilac-ruffle-scrunchie.webp');
  });

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
    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).toBeNull();
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
