import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import StorePages from './StorePages';
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
afterEach(() => { cleanup(); vi.clearAllMocks(); window.history.replaceState(null, '', '/'); document.querySelector('meta[name="robots"]')?.remove(); });

describe('live store pages', () => {
  it('shows the business phone, order model and policy links on the About page', () => {
    window.history.replaceState(null, '', '/about/');
    render(<StorePages {...initial} />);
    expect(screen.getByText(/does not complete a purchase or take payment/)).toBeTruthy();
    expect(screen.getByText(/Displayed product prices include GST/)).toBeTruthy();
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
    expect(screen.getByText('₹500')).toBeTruthy();
    rerender(<StorePages {...initial} products={[{ ...products[0], price: 650, inStock: false,
      variants: products[0].variants.map(variant => ({ ...variant, inStock: false })) }]} />);
    expect(screen.getByText('₹650')).toBeTruthy();
    expect(screen.getByText('Sold out')).toBeTruthy();
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
