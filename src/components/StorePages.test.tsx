import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import StorePages from './StorePages';
import type { Product } from '../types/product';

vi.mock('./Header', () => ({ default: () => <header /> }));
vi.mock('./Footer', () => ({ default: () => <footer /> }));
const products: Product[] = [{ id: 'p1', name: 'Bunny', category: 'Toys', description: 'Crochet bunny.',
  price: 500, image: 'https://images.luviacreations.com/products/admin/bunny.webp', inStock: true, color: '#ffffff', variants: [] }];
const initial = { products, categorySettings: [{ name: 'Toys', priority: 10 }], isLoading: false,
  loadError: null, hasCatalogueSnapshot: true, refreshProducts: vi.fn().mockResolvedValue(undefined) };
afterEach(() => { cleanup(); vi.clearAllMocks(); window.history.replaceState(null, '', '/'); document.querySelector('meta[name="robots"]')?.remove(); });

describe('live store pages', () => {
  it('uses the homepage warm card surface and full-photo layout without white padding', () => {
    window.history.replaceState(null, '', '/collections/toys/');
    render(<StorePages {...initial} />);
    const photoLink = screen.getByRole('link', { name: 'View Bunny' });
    const card = photoLink.closest('li');
    expect(card?.classList.contains('bg-mustard/25')).toBe(true);
    expect(card?.classList.contains('bg-white')).toBe(false);
    expect(photoLink.classList.contains('aspect-square')).toBe(true);
    expect(within(photoLink).getByRole('img', { name: 'Bunny' }).classList.contains('object-contain')).toBe(true);
    expect(photoLink.querySelector('img[aria-hidden="true"]')?.classList.contains('blur-xl')).toBe(true);
    expect(screen.getByRole('link', { name: 'Bunny' }).getAttribute('href')).toContain('/p/');
  });
  it('reflects admin additions and removals in the collections hub', () => {
    window.history.replaceState(null, '', '/collections/');
    const { rerender } = render(<StorePages {...initial} />);
    const nav = screen.getByRole('navigation', { name: 'Explore collections' });
    expect(within(nav).getByRole('link', { name: 'Toys' }).getAttribute('href')).toBe('/collections/toys/');
    rerender(<StorePages {...initial} categorySettings={[{ name: 'Gifts', priority: 1 }]} />);
    expect(within(nav).queryByRole('link', { name: 'Toys' })).toBeNull();
    expect(within(nav).getByRole('link', { name: 'Gifts' }).getAttribute('href')).toBe('/collections/gifts/');
  });

  it('updates product prices and removes unpublished items after a live refresh', () => {
    window.history.replaceState(null, '', '/collections/toys/');
    const { rerender } = render(<StorePages {...initial} />);
    expect(screen.getByText('₹500')).toBeTruthy();
    rerender(<StorePages {...initial} products={[{ ...products[0], price: 650, inStock: false }]} />);
    expect(screen.getByText('₹650')).toBeTruthy();
    expect(screen.getByText('Out of stock')).toBeTruthy();
    rerender(<StorePages {...initial} products={[]} />);
    expect(screen.queryByRole('heading', { name: 'Bunny' })).toBeNull();
    expect(screen.getByText('No published products in this collection yet.')).toBeTruthy();
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex,follow');
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

  it('supports explicit and return-to-tab refreshes without silently hiding load errors', () => {
    window.history.replaceState(null, '', '/about/');
    render(<StorePages {...initial} loadError="Network unavailable" />);
    expect(screen.getByRole('alert').textContent).toContain('Network unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh catalogue' }));
    expect(initial.refreshProducts).toHaveBeenCalledOnce();
    fireEvent(window, new Event('focus'));
    expect(initial.refreshProducts).toHaveBeenCalledTimes(2);
  });

  it('shows the shared factual FAQ and live category links', () => {
    window.history.replaceState(null, '', '/faq/');
    render(<StorePages {...initial} />);
    expect(screen.getByText('How do I place an order?')).toBeTruthy();
    expect(screen.getByText(/sending a message does not confirm an order/)).toBeTruthy();
    expect(within(screen.getByRole('navigation', { name: 'Explore collections' })).getByRole('link', { name: 'Toys' })).toBeTruthy();
  });

  it('does not expose bundled legacy products after an initial live load fails without a snapshot', () => {
    window.history.replaceState(null, '', '/collections/toys/');
    render(<StorePages {...initial} hasCatalogueSnapshot={false} loadError="Network unavailable" />);
    expect(screen.queryByRole('heading', { name: 'Bunny' })).toBeNull();
    expect(screen.getByRole('alert').textContent).toContain('Please retry');
  });
});
