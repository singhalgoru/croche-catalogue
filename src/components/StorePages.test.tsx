import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import StorePages from './StorePages';
import storeContent from '../content/storeContent.json';
import type { Product } from '../types/product';

vi.mock('./Header', () => ({ default: ({ categories }: { categories: string[] }) => <header>{categories.join(', ')}</header> }));
vi.mock('./Footer', () => ({ default: () => <footer /> }));
const products: Product[] = [{ id: 'p1', name: 'Bunny', category: 'Toys', description: 'Crochet bunny.',
  price: 500, showPrice: true, image: 'https://images.luviacreations.com/products/admin/bunny.webp', inStock: true, color: '#ffffff',
  variants: [{ id: 'v1', name: 'White', color: '#ffffff', price: null, inStock: true, availableQuantity: 10,
    image: 'https://images.luviacreations.com/products/admin/bunny.webp', imagePath: 'products/admin/bunny.webp', gallery: [] }] }];
const initial = { products, categorySettings: [{ name: 'Toys', priority: 10 }], isLoading: false,
  loadError: null, hasCatalogueSnapshot: true, onAddToCart: vi.fn().mockResolvedValue(true),
  isCartBusy: false, getCartQuantity: () => 0, cartItemCount: 0, cartUpdateCount: 0, onOpenCart: vi.fn() };
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); window.history.replaceState(null, '', '/'); document.querySelector('meta[name="robots"]')?.remove(); });

describe('live store pages', () => {
  it('retains submitted searches, reuses them and supports individual and complete removal', async () => {
    window.history.replaceState(null, '', '/search/');
    const view = render(<StorePages {...initial} />);
    const input = screen.getByRole('searchbox', { name: 'Search products' });
    fireEvent.change(input, { target: { value: '  white   bunny  ' } });
    expect(localStorage.getItem('luvia:recent-searches')).toBeNull();
    fireEvent.submit(screen.getByRole('search'));
    expect(JSON.parse(localStorage.getItem('luvia:recent-searches')!)).toEqual(['white bunny']);
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    fireEvent.change(input, { target: { value: 'gajra' } });
    fireEvent.submit(screen.getByRole('search'));
    view.unmount();
    window.history.replaceState(null, '', '/search/');
    render(<StorePages {...initial} />);
    const recent = await screen.findByRole('region', { name: 'Recent searches' });
    expect(within(recent).getAllByRole('listitem').map(item => item.textContent)).toEqual(['gajra×', 'white bunny×']);
    fireEvent.click(within(recent).getByRole('button', { name: 'white bunny' }));
    expect(new URLSearchParams(window.location.search).get('q')).toBe('white bunny');
    expect(screen.getByRole('article', { name: 'Product: Bunny' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove recent search: white bunny' }));
    expect(screen.queryByRole('button', { name: 'white bunny' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Clear all searches' }));
    expect(screen.queryByRole('region', { name: 'Recent searches' })).toBeNull();
    expect(localStorage.getItem('luvia:recent-searches')).toBeNull();
  });
  it('keeps live search usable and reports when recent searches cannot be saved', () => {
    window.history.replaceState(null, '', '/search/');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage blocked'); });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<StorePages {...initial} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'bunny' } });
    fireEvent.submit(screen.getByRole('search'));
    expect(screen.getByRole('article', { name: 'Product: Bunny' })).toBeTruthy();
    expect(screen.getByText('Changes to recent searches could not be saved on this device.')).toBeTruthy();
    expect(log).toHaveBeenCalledWith('Unable to save recent searches:', expect.any(Error));
  });
  it('updates results as keywords are typed and saves the URL on Enter submission without a search button', () => {
    window.history.replaceState(null, '', '/search/?q=white%20bunny');
    render(<StorePages {...initial} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Search products' })).toBeTruthy();
    expect(screen.getByRole('article', { name: 'Product: Bunny' })).toBeTruthy();
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex,follow');
    const input = screen.getByRole('searchbox', { name: 'Search products' });
    fireEvent.change(input, { target: { value: 'not-present' } });
    expect(new URLSearchParams(window.location.search).get('q')).toBe('white bunny');
    expect(screen.queryByRole('article')).toBeNull();
    expect(screen.getByText(/No matching products/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Search' })).toBeNull();
    fireEvent.submit(screen.getByRole('search'));
    expect(new URLSearchParams(window.location.search).get('q')).toBe('not-present');
    expect(screen.queryByRole('article')).toBeNull();
    expect(screen.getByText(/No matching products/)).toBeTruthy();
    fireEvent.change(input, { target: { value: 'bun' } });
    expect(screen.getByRole('article', { name: 'Product: Bunny' })).toBeTruthy();
    expect(new URLSearchParams(window.location.search).get('q')).toBe('not-present');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.submit(screen.getByRole('search'));
    expect(window.location.search).toBe('');
    expect(screen.queryByRole('article')).toBeNull();
    expect(screen.getByText('Search for a product to see matching results.')).toBeTruthy();
    expect(screen.getByRole('search').getAttribute('method')).toBe('get');
    expect(screen.queryByText('Confirm the final price, shipping charges and dispatch estimate with us before paying.')).toBeNull();
  });
  it('renders the complete founder story with shared chrome and retains contact and ordering information', () => {
    window.history.replaceState(null, '', '/about/');
    const metas = ['description', 'og:description', 'twitter:description', 'og:title', 'twitter:title'].map(name => {
      const meta = document.createElement('meta');
      meta.setAttribute(name.startsWith('og:') ? 'property' : 'name', name);
      document.head.append(meta);
      return meta;
    });
    try {
      render(<StorePages {...initial} />);
      expect(screen.getByRole('heading', { level: 1, name: storeContent.brandStory.title })).toBeTruthy();
      const story = screen.getByRole('article', { name: "Luvia's founder story" });
      expect(within(story).getByText(storeContent.brandStory.intro)).toBeTruthy();
      expect(within(story).getByRole('heading', { name: storeContent.brandStory.founderNote.title })).toBeTruthy();
      expect(within(story).getByText(storeContent.brandStory.founderNote.text)).toBeTruthy();
      expect(within(story).getByText(storeContent.brandStory.founderNote.role)).toBeTruthy();
      for (const section of storeContent.brandStory.sections) {
        expect(within(story).getByRole('heading', { name: section.title })).toBeTruthy();
        for (const paragraph of section.paragraphs) expect(within(story).getByText(paragraph)).toBeTruthy();
      }
      expect(within(story).getByRole('link', { name: storeContent.brandStory.shopLabel }).getAttribute('href')).toBe('/collections/');
      expect(screen.getByRole('heading', { name: 'Contact Luvia' })).toBeTruthy();
      expect(screen.getByText(storeContent.dispatch)).toBeTruthy();
      expect(screen.getByRole('banner')).toBeTruthy();
      expect(screen.getByRole('contentinfo')).toBeTruthy();
      expect(document.title).toBe(`${storeContent.brandStory.title} | Luvia Creations`);
      for (const meta of metas) expect(meta.content).toBe(
        (meta.getAttribute('property') || meta.name).endsWith('title') ? document.title : storeContent.brandStory.description);
    } finally {
      metas.forEach(meta => meta.remove());
    }
  });
  it('renders featured products with shared chrome and excludes sold out and unfeatured items', () => {
    window.history.replaceState(null, '', '/featured/');
    render(<StorePages {...initial} products={[
      { ...products[0], featured: true },
      { ...products[0], id: 'sold', name: 'Sold out', featured: true, variants: [] },
      { ...products[0], id: 'plain', name: 'Not featured' },
    ]} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Featured products' })).toBeTruthy();
    expect(screen.getByRole('article', { name: 'Product: Bunny' })).toBeTruthy();
    expect(screen.queryByRole('article', { name: 'Product: Sold out' })).toBeNull();
    expect(screen.queryByRole('article', { name: 'Product: Not featured' })).toBeNull();
    expect(screen.getByRole('banner')).toBeTruthy();
    expect(screen.getByRole('contentinfo')).toBeTruthy();
    expect(document.title).toBe('Featured products | Luvia Creations');
  });
  it('renders a single bootstrap bestseller on its dedicated page without inventing more products', () => {
    window.history.replaceState(null, '', '/bestsellers/');
    render(<StorePages {...initial} initialBestsellerIds={['p1', 'missing']} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Bestsellers' })).toBeTruthy();
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByRole('article', { name: 'Product: Bunny' })).toBeTruthy();
  });
  it.each([
    ['/collections/', ['Home', 'Explore our handmade collections'], ['/', '/collections/']],
    ['/collections/toys/', ['Home', 'Collections', 'Handmade Toys'], ['/', '/collections/', '/collections/toys/']],
  ])('preserves matching collection breadcrumbs and schema after app mount at %s', (pathname, names, paths) => {
    window.history.replaceState(null, '', pathname);
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    document.head.append(script);
    try {
      render(<StorePages {...initial} />);
      const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
      expect([...nav.children].map(item => item.textContent)).toEqual(names);
      expect([...nav.querySelectorAll('a')].map(link => link.getAttribute('href'))).toEqual(paths.slice(0, -1));
      expect(JSON.parse(script.textContent!).breadcrumb).toEqual({
        '@type': 'BreadcrumbList',
        itemListElement: names.map((name, index) => ({
          '@type': 'ListItem', position: index + 1, name, item: `${window.location.origin}${paths[index]}`,
        })),
      });
    } finally {
      script.remove();
    }
  });

  it('opens a dedicated bulk gifting page with an immediately available enquiry form', () => {
    window.history.replaceState(null, '', '/bulk-orders/');
    render(<StorePages {...initial} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Bulk Orders & Corporate Gifting' })).toBeTruthy();
    expect(screen.getByRole('form', { name: 'Bulk order email enquiry' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Enquire on WhatsApp' })).toBeTruthy();
    expect(document.title).toBe('Bulk Orders & Corporate Gifting | Luvia Creations');
    expect(screen.queryByText('Find your favourites by collection, then open a product for photos and details.')).toBeNull();
  });
  it.each([
    ['/terms-and-conditions/', 'Terms & Conditions', 'Prices and payment'],
    ['/privacy-policy/', 'Privacy Policy', 'Your choices and requests'],
  ])('renders a dedicated policy at %s without collection content', (path, title, section) => {
    window.history.replaceState(null, '', path);
    render(<StorePages {...initial} />);
    expect(screen.getByRole('heading', { name: title, level: 1 })).toBeTruthy();
    expect(screen.getByRole('heading', { name: section })).toBeTruthy();
    expect(screen.getByText(`Last updated: ${path === '/privacy-policy/' ? '25' : '14'} October 2026`)).toBeTruthy();
    if (path === '/privacy-policy/') {
      expect(screen.getByText(/latest eight submitted search keywords/)).toBeTruthy();
    }
    expect(screen.getByRole('link', { name: 'Return and refund policy' }).getAttribute('href')).toBe('/return-policy/');
    expect(screen.queryByText('Find your favourites by collection, then open a product for photos and details.')).toBeNull();
  });
  it('explains AI lifestyle imagery using the shared FAQ disclosure', () => {
    window.history.replaceState(null, '', '/faq/');
    render(<StorePages {...initial} />);
    expect(screen.getByText('Are your product images generated using AI?')).toBeTruthy();
    expect(screen.getByText(/photographs of our actual handmade products/).textContent)
      .toContain('may not reproduce every stitch, colour or proportion exactly');
  });
  it('does not send collection shoppers back to homepage filters', () => {
    window.history.replaceState(null, '', '/collections/toys/');
    render(<StorePages {...initial} />);
    expect(screen.queryByRole('link', { name: /with the cart/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Share Toys collection' })).toBeTruthy();
  });
  it('filters a collection using price bands derived only from that category', () => {
    const highToy = { ...products[0], id: 'p2', name: 'Large Bunny', price: 900 };
    const decor = { ...products[0], id: 'p3', name: 'Flower', category: 'Decor', price: 100 };
    window.history.replaceState(null, '', '/collections/toys/');
    render(<StorePages {...initial}
      products={[...products, highToy, decor]}
      categorySettings={[
        { name: 'Toys', priority: 1 },
        { name: 'Decor', priority: 2 },
      ]} />);

    const priceFilter = screen.getByRole('region', { name: 'Filter collection products by price' });
    fireEvent.click(priceFilter.querySelector('summary')!);
    expect(within(priceFilter).getByRole('button', { name: 'Up to ₹700' })).toBeTruthy();
    expect(within(priceFilter).getByRole('button', { name: '₹700+' })).toBeTruthy();
    expect(within(priceFilter).queryByRole('button', { name: 'Up to ₹500' })).toBeNull();

    fireEvent.click(within(priceFilter).getByRole('button', { name: '₹700+' }));
    expect(screen.getByRole('status').textContent).toBe('Showing 1 of 2 products');
    expect(screen.getByRole('article', { name: 'Product: Large Bunny' })).toBeTruthy();
    expect(screen.queryByRole('article', { name: 'Product: Bunny' })).toBeNull();

    fireEvent.click(within(priceFilter).getByRole('button', { name: 'Clear price filter' }));
    expect(screen.getByRole('status').textContent).toBe('Showing 2 of 2 products');
  });
  it('caps previously saved long overviews at 90 words', () => {
    window.history.replaceState(null, '', '/collections/toys/');
    render(<StorePages {...initial} categorySettings={[{ name: 'Toys', priority: 10, overview: Array(200).fill('crochet').join(' ') }]} />);
    expect(screen.getByText(Array(90).fill('crochet').join(' '))).toBeTruthy();
    expect(screen.queryByText(Array(200).fill('crochet').join(' '))).toBeNull();
  });
  it('shows seasonal membership and the saved overview without moving the primary category', () => {
    window.history.replaceState(null, '', '/collections/navaratri/');
    render(<StorePages {...initial} categorySettings={[...initial.categorySettings, {
      name: 'Navaratri', priority: 999, isSeasonal: true, visible: true, productIds: ['p1'], overview: 'Our reviewed seasonal overview.',
    }]} />);
    expect(screen.getByText('Our reviewed seasonal overview.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Share Navaratri collection' })).toBeTruthy();
    expect(screen.getByRole('article', { name: 'Product: Bunny' })).toBeTruthy();
    expect(screen.getByRole('banner').textContent).toBe('Navaratri, Toys');
  });
  it('shows the custom cover on the hub only, and restores the product fallback', () => {
    const coverImage = 'https://images.luviacreations.com/products/admin/season.webp';
    const settings = [...initial.categorySettings, { name: 'Festive', priority: 1, isSeasonal: true, productIds: ['p1'], coverImage }];
    window.history.replaceState(null, '', '/collections/');
    const { rerender, unmount } = render(<StorePages {...initial} categorySettings={settings} />);
    const link = screen.getByRole('link', { name: 'Festive' });
    expect(link.querySelector('img:not([aria-hidden])')?.getAttribute('src')).toContain('season-w480.webp');
    rerender(<StorePages {...initial} categorySettings={[initial.categorySettings[0], { ...settings[1], coverImage: '' }]} />);
    expect(link.querySelector('img:not([aria-hidden])')?.getAttribute('src')).toContain('bunny-w480.webp');
    unmount();
    window.history.replaceState(null, '', '/collections/festive/');
    render(<StorePages {...initial} categorySettings={settings} />);
    expect(screen.queryByAltText('Festive collection')).toBeNull();
    expect(document.querySelector('img[src*="season"]')).toBeNull();
    expect(screen.getByRole('article', { name: 'Product: Bunny' })).toBeTruthy();
  });
  it('shows the business phone, order model and policy links on the About page', () => {
    window.history.replaceState(null, '', '/about/');
    render(<StorePages {...initial} />);
    const orderingCopy = screen.getByText(/then pay securely through Razorpay/);
    expect(orderingCopy.textContent).toContain('Your online order is confirmed after payment verification.');
    expect(orderingCopy.textContent).toContain('Adding items to a cart or sending a WhatsApp message does not take payment or confirm an order.');
    expect(screen.getByText(/Prices are in Indian rupees/)).toBeTruthy();
    expect(screen.getByRole('link', { name: '+91 92059 07350' }).getAttribute('href')).toContain('https://wa.me/');
    expect(screen.getByRole('link', { name: 'Return and refund policy' }).getAttribute('href')).toBe('/return-policy/');
  });
  it('shows a compact photo-led hub with live product counts and no duplicate category section', () => {
    window.history.replaceState(null, '', '/collections/');
    const { rerender } = render(<StorePages {...initial} />);
    const nav = screen.getByRole('navigation', { name: 'Explore collections' });
    const toyLink = within(nav).getByRole('link', { name: 'Toys' });
    expect(toyLink.querySelectorAll('img')).toHaveLength(2);
    expect(toyLink.textContent).toContain('1 product');
    expect(screen.queryByRole('heading', { name: 'Explore collections' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Shop all products' }).getAttribute('href')).toBe('/');
    rerender(<StorePages {...initial} products={[...products, { ...products[0], id: 'p2' }]} />);
    expect(toyLink.textContent).toContain('2 products');
  });
  it('uses the homepage warm card surface and full-photo layout without white padding', () => {
    window.history.replaceState(null, '', '/collections/toys/');
    render(<StorePages {...initial} />);
    const photoLink = screen.getByRole('button', { name: 'View Bunny' });
    const card = photoLink.closest('article');
    expect(card?.classList.contains('bg-mustard/25')).toBe(true);
    expect(card?.classList.contains('bg-white')).toBe(false);
    expect(photoLink.parentElement?.classList.contains('aspect-square')).toBe(true);
    expect(within(photoLink).getByRole('img', { name: 'Bunny' }).classList.contains('object-contain')).toBe(true);
    expect(photoLink.parentElement?.querySelector('img[aria-hidden="true"]')?.classList.contains('blur-xl')).toBe(true);
    expect(screen.getByRole('link', { name: 'Bunny' }).getAttribute('href')).toContain('/p/');
  });
  it('reflects admin additions and removals in the collections hub', () => {
    window.history.replaceState(null, '', '/collections/');
    const { rerender } = render(<StorePages {...initial} />);
    const nav = screen.getByRole('navigation', { name: 'Explore collections' });
    expect(within(nav).getByRole('link', { name: 'Toys' }).getAttribute('href')).toBe('/collections/toys/');
    rerender(<StorePages {...initial} products={[{ ...products[0], category: 'Gifts' }]} categorySettings={[{ name: 'Gifts', priority: 1 }]} />);
    expect(within(nav).queryByRole('link', { name: 'Toys' })).toBeNull();
    expect(within(nav).getByRole('link', { name: 'Gifts' }).getAttribute('href')).toBe('/collections/gifts/');
  });

  it('hides categories without published products on every store page and restores them after publication', () => {
    const settings = [...initial.categorySettings, { name: 'Rakhi', priority: 20 }];
    for (const pathname of ['/collections/', '/collections/toys/', '/about/', '/faq/']) {
      window.history.replaceState(null, '', pathname);
      const { rerender, unmount } = render(<StorePages {...initial} categorySettings={settings} />);
      const nav = screen.getByRole('navigation', { name: 'Explore collections' });
      expect(within(nav).queryByRole('link', { name: 'Rakhi' })).toBeNull();
      expect(screen.getByRole('banner').textContent).not.toContain('Rakhi');
      rerender(<StorePages {...initial} categorySettings={settings} products={[...products, { ...products[0], id: 'r1', category: 'Rakhi' }]} />);
      expect(within(nav).getByRole('link', { name: 'Rakhi' })).toBeTruthy();
      expect(screen.getByRole('banner').textContent).toContain('Rakhi');
      rerender(<StorePages {...initial} categorySettings={settings} />);
      expect(within(nav).queryByRole('link', { name: 'Rakhi' })).toBeNull();
      unmount();
    }
  });
  it('updates product prices and removes unpublished items after a live refresh', () => {
    window.history.replaceState(null, '', '/collections/toys/');
    const { rerender } = render(<StorePages {...initial} />);
    expect(within(screen.getByRole('article', { name: 'Product: Bunny' })).getByText('₹500')).toBeTruthy();
    rerender(<StorePages {...initial} products={[{ ...products[0], price: 650, inStock: false,
      variants: products[0].variants.map(variant => ({ ...variant, inStock: false })) }]} />);
    expect(within(screen.getByRole('article', { name: 'Product: Bunny' })).getByText('₹650')).toBeTruthy();
    expect(screen.getAllByText('Out of stock')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Add to cart — Bunny' })).toBeNull();
    rerender(<StorePages {...initial} products={[]} />);
    expect(screen.queryByRole('heading', { name: 'Bunny' })).toBeNull();
    expect(screen.getByText('No published products in this collection yet.')).toBeTruthy();
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex,follow');
  });

  it('adds the selected variant from collection cards and shares the product link', async () => {
    window.history.replaceState(null, '', '/collections/toys/');
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { configurable: true, value: share });
    try {
      render(<StorePages {...initial} />);
      fireEvent.click(screen.getByRole('button', { name: 'Add to cart — Bunny' }));
      await waitFor(() => expect(initial.onAddToCart).toHaveBeenCalledWith(products[0], products[0].variants[0]));
      fireEvent.click(screen.getByRole('button', { name: 'Share Bunny' }));
      await waitFor(() => expect(share).toHaveBeenCalledWith(expect.objectContaining({
        title: expect.stringContaining('Bunny'), url: expect.stringContaining('/p/bunny/'),
      })));
    } finally {
      Reflect.deleteProperty(navigator, 'share');
    }
  });

  it('blocks cart additions while checking availability or when refresh fails', () => {
    window.history.replaceState(null, '', '/collections/toys/');
    const { rerender } = render(<StorePages {...initial} isLoading />);
    expect(screen.getByRole('button', { name: 'Add to cart — Bunny' }).hasAttribute('disabled')).toBe(true);
    rerender(<StorePages {...initial} loadError="Offline" />);
    expect(screen.getByRole('button', { name: 'Add to cart — Bunny' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Share Bunny' }).hasAttribute('disabled')).toBe(false);
  });

  it('preserves minimum orders, private prices and the shopper-selected variant', async () => {
    window.history.replaceState(null, '', '/collections/toys/');
    const second = { ...products[0].variants[0], id: 'v2', name: 'Pink', image: '/pink.webp' };
    const item = { ...products[0], showPrice: false, minimumOrderQuantity: 3,
      variants: [...products[0].variants, second] };
    render(<StorePages {...initial} products={[item]} />);
    expect(screen.getByText('Minimum 3 pieces')).toBeTruthy();
    expect(screen.queryByText('₹500')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show Pink variant image for Bunny' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add to cart — Bunny' }));
    await waitFor(() => expect(initial.onAddToCart).toHaveBeenCalledWith(item, second));
  });

  it('shows a removed collection as unavailable, never the full catalogue', () => {
    window.history.replaceState(null, '', '/collections/toys/');
    render(<StorePages {...initial} categorySettings={[{ name: 'Gifts', priority: 1 }]} />);
    expect(screen.getByRole('alert').textContent).toContain('no longer available');
    expect(screen.queryByRole('heading', { name: 'Bunny' })).toBeNull();
  });

  it('resolves newly added collection URLs through the pre-deployment fallback', () => {
    window.history.replaceState(null, '', '/?collectionPage=toys');
    render(<StorePages {...initial} />);
    expect(screen.getByRole('heading', { name: 'Handmade Toys' })).toBeTruthy();
    expect(window.location.pathname).toBe('/collections/toys/');
  });

  it('removes manual refresh and explains automatic retries without hiding load errors', () => {
    window.history.replaceState(null, '', '/about/');
    render(<StorePages {...initial} loadError="Network unavailable" />);
    expect(screen.getByRole('alert').textContent).toContain('Network unavailable');
    expect(screen.queryByRole('button', { name: 'Refresh catalogue' })).toBeNull();
    expect(screen.getByRole('alert').textContent).toContain('Retrying automatically');
  });

  it('shows the shared factual FAQ and live category links', () => {
    window.history.replaceState(null, '', '/faq/');
    render(<StorePages {...initial} />);
    expect(screen.getByText('How do I place an order?')).toBeTruthy();
    expect(screen.getByText(/sending a message does not confirm an order/)).toBeTruthy();
    expect(within(screen.getByRole('navigation', { name: 'Explore collections' })).getByRole('link', { name: 'Toys' })).toBeTruthy();
  });

  it('positions the brand as premium on the about page without changing product details', () => {
    window.history.replaceState(null, '', '/about/');
    render(<StorePages {...initial} />);
    expect(screen.getByRole('heading', { name: 'Thoughtfully crafted crochet, made to be treasured' })).toBeTruthy();
    expect(screen.getByText(/brings a premium touch to handmade crochet accessories/)).toBeTruthy();
  });

  it('does not expose bundled legacy products after an initial live load fails without a snapshot', () => {
    window.history.replaceState(null, '', '/collections/toys/');
    render(<StorePages {...initial} hasCatalogueSnapshot={false} loadError="Network unavailable" />);
    expect(screen.queryByRole('heading', { name: 'Bunny' })).toBeNull();
    expect(screen.getByRole('alert').textContent).toContain('Retrying automatically');
  });
});
