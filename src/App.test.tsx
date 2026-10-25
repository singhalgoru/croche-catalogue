import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product } from './types/product';
import App from './App';
import storeContent from './content/storeContent.json';
vi.mock('./components/MobileNavigation', () => ({ default: () => null }));

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
    products: catalogueProducts, categorySettings: [...new Set(catalogueProducts.map(item => item.category))]
      .map((name, priority) => ({ name, priority })),
    isLoading: catalogueLoading, loadError: null, refreshProducts: vi.fn(),
    hasCatalogueSnapshot: catalogueSnapshot,
    homepageMetadata: { title: 'Catalogue', description: 'Catalogue summary.', canonical: 'https://luviacreations.com/' },
  }),
}));
vi.mock('./hooks/useTickerMessages', () => ({ useTickerMessages: () => ['Shipping across India'] }));
vi.mock('./hooks/useCart', () => ({
  useCart: () => ({ itemCount: 0, cartUpdateCount: 0, cart: null, isBusy: false, addItem }),
}));
vi.mock('./hooks/useCustomerName', () => ({ useCustomerName: () => null }));
vi.mock('./services/analytics', () => ({
  trackEvent: vi.fn(), trackProductSelected: vi.fn(), trackProductViewed: vi.fn(),
  trackWhatsAppEnquiry: vi.fn(), trackWhatsAppCart: vi.fn(), trackContactClick: vi.fn(),
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
  it('introduces the founder story on the catalogue with a crawlable about link', () => {
    render(<App />);
    const teaser = screen.getByRole('region', { name: storeContent.brandStory.teaser.title });
    expect(within(teaser).getByText(storeContent.brandStory.teaser.text)).toBeTruthy();
    expect(within(teaser).getByRole('link', { name: storeContent.brandStory.teaser.linkLabel }).getAttribute('href')).toBe('/about/');
    expect(teaser.parentElement?.firstElementChild).toBe(teaser);
  });
  it('renders watch pages with the homepage header and interactive footer, not the catalogue', () => {
    catalogueProducts = [{ ...product, makingVideo: {
      title: 'Handcrafting a coaster', videoUrl: 'https://videos.luviacreations.com/making-videos/test/video.mp4',
      posterUrl: 'https://videos.luviacreations.com/making-videos/test/poster.webp',
      durationSeconds: 20, width: 848, height: 478,
    } }];
    window.history.replaceState(null, '', '/watch/test-coaster/');
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Handcrafting a coaster', level: 1 })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Premium Handmade Crochet Creations' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open navigation' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close navigation' }));
    const footer = screen.getByRole('contentinfo');
    fireEvent.click(within(footer).getByRole('button', { name: 'Help & information' }));
    expect(within(footer).getByRole('link', { name: 'Contact on Instagram' })).toBeTruthy();
    expect(screen.queryByLabelText('Filtered products')).toBeNull();
    expect(screen.getByRole('link', { name: /View Test Coaster/ }).getAttribute('href')).toContain('/p/test-coaster/');
    expect(document.querySelector('main video')?.getAttribute('preload')).toBe('none');
    expect(window.location.pathname).toBe('/watch/test-coaster/');
  });

  it('opens feedback as a dedicated page without requiring sign-in', async () => {
    window.history.replaceState(null, '', '/?page=feedback');
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Share feedback', level: 1 })).toBeTruthy();
    expect(await screen.findByRole('form', { name: 'Share feedback form' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to shop' }).getAttribute('href')).toBe('/');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(within(screen.getByRole('contentinfo')).queryByRole('form')).toBeNull();
  });
  it('preserves email-link credentials until the lazy authentication client consumes them', () => {
    window.history.replaceState(null, '', '/#access_token=test-callback&refresh_token=test-refresh&type=magiclink');
    render(<App />);
    expect(new URLSearchParams(window.location.hash.slice(1)).get('access_token')).toBe('test-callback');
  });

  it('opens the variant from a Reddit static path and preserves that share destination', async () => {
    catalogueProducts = [{ ...product, variants: [
      product.variants[0],
      { ...product.variants[0], id: 'variant-white', name: 'White', publicSlug: 'white', image: '/white.webp' },
    ] }];
    window.history.replaceState(null, '', '/p/test-coaster/variant/white/?utm_source=reddit');
    render(<App />);
    await screen.findByRole('heading', { name: 'Test Coaster', level: 1 });
    expect(screen.getByRole('img', { name: 'Test Coaster' }).getAttribute('src')).toBe('/white.webp');
    expect(window.location.pathname).toBe('/p/test-coaster/variant/white/');
    expect(new URLSearchParams(window.location.search).get('utm_source')).toBe('reddit');
  });

  it('adds from a collection card and opens the shared cart without leaving the collection', async () => {
    window.history.replaceState(null, '', '/collections/home/');
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Add to cart — Test Coaster' }));
    await waitFor(() => expect(addItem).toHaveBeenCalledWith(product, product.variants[0]));
    fireEvent.click(screen.getAllByRole('button', { name: 'Open cart with 0 items' })[0]);
    expect(await screen.findByRole('navigation', { name: 'Checkout steps' })).toBeTruthy();
    expect(window.location.search).toContain('checkout=cart');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('Your cart is empty')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close cart' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(window.location.pathname).toBe('/collections/home/');
  });

  it('offers a single collection carousel above products without changing product ordering', () => {
    render(<App />);
    const nav = screen.getByRole('navigation', { name: 'Explore collections' });
    expect(within(nav).getByRole('link', { name: 'Home' }).getAttribute('href')).toBe('/collections/home/');
    const grid = screen.getByLabelText('Filtered products');
    expect(grid.textContent).toBe('Test Coaster');
    expect(grid.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    expect(screen.getAllByRole('navigation', { name: 'Explore collections' })).toHaveLength(1);
  });
  it('composes price and category filters without including unpriced products in a selected range', () => {
    catalogueProducts = [
      product,
      { ...product, id: 'home-mid', name: 'Mid-priced Home item', price: 250 },
      { ...product, id: 'toy', name: 'Toy item', category: 'Toys', price: 300 },
      { ...product, id: 'toy-low', name: 'Low-priced toy', category: 'Toys', price: 100 },
      { ...product, id: 'enquiry', name: 'Enquiry item', price: null, showPrice: false },
    ];
    render(<App />);
    fireEvent.click(screen.getByText('Filter by price'));
    fireEvent.change(screen.getByLabelText('Minimum'), { target: { value: '200' } });
    fireEvent.change(screen.getByLabelText('Maximum'), { target: { value: '350' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByLabelText('Filtered products').textContent)
      .toBe('Mid-priced Home item, Toy item');

    fireEvent.click(screen.getByText('Filter by category'));
    fireEvent.click(screen.getByRole('button', { name: 'Toys' }));
    expect(screen.getByLabelText('Filtered products').textContent).toBe('Toy item');
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters ×' }));
    expect(screen.getByLabelText('Filtered products').textContent.split(',')).toHaveLength(5);
    expect(screen.queryByRole('button', { name: 'Clear price filter' })).toBeNull();
    expect(screen.getByText('Filter by category')).toBeTruthy();
  });
  it('limits quick price ranges to the selected category and clears incompatible ranges', () => {
    catalogueProducts = [
      { ...product, id: 'home-low', name: 'Low-priced Home item', price: 100 },
      { ...product, id: 'home-high', name: 'High-priced Home item', price: 250 },
      { ...product, id: 'toy-low', name: 'Low-priced Toy', category: 'Toys', price: 300 },
      { ...product, id: 'toy-high', name: 'High-priced Toy', category: 'Toys', price: 1000 },
    ];
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /^Filters/ }));
    let panel = screen.getByRole('dialog', { name: 'Filter products' });
    expect(within(panel).getAllByRole('button', { name: /₹/ })).toHaveLength(4);
    fireEvent.click(within(panel).getByRole('button', { name: 'Toys' }));
    panel = screen.getByRole('dialog', { name: 'Filter products' });
    expect(within(panel).getAllByRole('button', { name: /₹/ }).map(button => button.textContent))
      .toEqual(['Up to ₹700', '₹700+']);
    expect(screen.getByLabelText('Filtered products').textContent)
      .toContain('Low-priced Home item');

    fireEvent.click(within(panel).getByRole('button', { name: '₹700+' }));
    expect(screen.getByRole('dialog', { name: 'Filter products' })).toBeTruthy();
    expect(screen.getByLabelText('Filtered products').textContent)
      .toContain('Low-priced Home item');
    fireEvent.click(screen.getByRole('button', { name: 'Show results' }));
    expect(screen.getByLabelText('Filtered products').textContent).toBe('High-priced Toy');
    fireEvent.click(screen.getByRole('button', { name: /^Filters/ }));
    panel = screen.getByRole('dialog', { name: 'Filter products' });
    fireEvent.click(within(panel).getByRole('button', { name: 'Home' }));
    expect(screen.getByLabelText('Filtered products').textContent).toBe('High-priced Toy');
    fireEvent.click(screen.getByRole('button', { name: 'Show results' }));
    expect(screen.getByLabelText('Filtered products').textContent)
      .toBe('Low-priced Home item, High-priced Home item');
    fireEvent.click(screen.getByRole('button', { name: 'Clear all filters' }));
    expect(screen.getByLabelText('Filtered products').textContent.split(',')).toHaveLength(4);
  });
  it('restores product and checkout pages on Back/Forward and returns to the original collection', async () => {
    window.history.replaceState(null, '', '/?utm_source=instagram');
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Open test product' }));
    await screen.findByRole('heading', { name: 'Test Coaster', level: 1 });
    expect(window.location.search).toContain('utm_source=instagram');
    fireEvent.click(screen.getByRole('button', { name: 'Open cart with 0 items' }));
    await screen.findByRole('navigation', { name: 'Checkout steps' });
    window.history.back();
    await screen.findByRole('heading', { name: 'Test Coaster', level: 1 });
    expect(screen.queryByRole('navigation', { name: 'Checkout steps' })).toBeNull();
    window.history.forward();
    await screen.findByRole('navigation', { name: 'Checkout steps' });
    fireEvent.click(screen.getByRole('button', { name: 'Close cart' }));
    await screen.findByRole('heading', { name: 'Test Coaster', level: 1 });
    expect(window.location.search).not.toContain('checkout=');
    fireEvent.click(screen.getByRole('link', { name: 'Back to collection' }));
    await screen.findByRole('searchbox', { name: 'Search crochet items' });
    expect(window.location.pathname).toBe('/');
    expect(window.location.search).toContain('utm_source=instagram');
  });
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
    expect(screen.getByRole('navigation', { name: 'Explore collections' }).textContent).toContain('Home');
    fireEvent.click(screen.getByText('Filter by category'));
    expect(screen.getByRole('button', { name: 'Home' })).toBeTruthy();
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
    expect(links[1].getAttribute('href')).toBe('/collections/home/');
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
    fireEvent.click(await screen.findByRole('button', { name: 'Add to cart — Related Coaster' }));
    await waitFor(() => expect(addItem).toHaveBeenCalledWith(related, related.variants[0]));
    window.history.back();
    await screen.findByRole('heading', { name: 'Test Coaster', level: 1 });
    expect(window.location.search).toContain('variant=red');
  });

  it('returns directly to the catalogue after following related products from a full product page', async () => {
    catalogueProducts = [product, { ...product, id: 'related-product', name: 'Related Coaster' }];
    render(<App />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search crochet items' }), { target: { value: 'coaster' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open test product' }));
    await screen.findByRole('heading', { name: 'Test Coaster', level: 1 });
    expect(screen.queryByRole('dialog')).toBeNull();
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

  it('opens a catalogue product as a page and restores catalogue filters on Back', async () => {
    render(<App />);
    const search = screen.getByRole('searchbox', { name: 'Search crochet items' });
    fireEvent.change(search, { target: { value: 'coaster' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open test product' }));
    await screen.findByRole('heading', { name: 'Test Coaster', level: 1 });
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
