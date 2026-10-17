import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import CategoryLook from './CategoryLook';
import { products } from '../data/products';
import * as analytics from '../services/analytics';

vi.mock('../services/analytics', () => ({
  trackShopTheLookViewed: vi.fn(), trackShopTheLookHotspot: vi.fn(), trackShopTheLookProductOpened: vi.fn(),
}));
const items = [
  { ...products[0], id: 'rose', name: 'Rose', category: 'Decor', price: 100, showPrice: true },
  { ...products[0], id: 'lotus', name: 'Lotus', category: 'Decor', price: 200, showPrice: false },
];
const category = { name: 'Decor', priority: 1, coverImage: '/styled.webp', imageHotspots: [
  { productId: 'rose', x: 25, y: 75 }, { productId: 'lotus', x: 50, y: 10 },
] };
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

it('tracks the look once when seen, hotspot taps and product opens', () => {
  let notify: IntersectionObserverCallback = () => {};
  const disconnect = vi.fn();
  vi.stubGlobal('IntersectionObserver', vi.fn(function (this: unknown, callback: IntersectionObserverCallback) {
    notify = callback;
    return { observe: vi.fn(), disconnect };
  }));
  render(<CategoryLook category={category} products={items} />);
  expect(analytics.trackShopTheLookViewed).not.toHaveBeenCalled();
  notify([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
  expect(analytics.trackShopTheLookViewed).toHaveBeenCalledTimes(1);
  expect(analytics.trackShopTheLookViewed).toHaveBeenCalledWith('Decor', [items[0], items[1]]);
  expect(disconnect).toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Explore Lotus, hotspot 2' }));
  expect(analytics.trackShopTheLookHotspot).toHaveBeenCalledWith('Decor', items[1], 1);
  const link = screen.getByRole('link', { name: 'View product' });
  link.addEventListener('click', event => event.preventDefault());
  fireEvent.click(link);
  expect(analytics.trackShopTheLookProductOpened).toHaveBeenCalledWith('Decor', items[1], 1, 'card');
});

it('positions accessible markers by percentage and opens the corresponding product card', () => {
  render(<CategoryLook category={category} products={items} />);
  const marker = screen.getByRole('button', { name: 'Explore Rose, hotspot 1' });
  expect(marker.style.left).toBe('25%');
  expect(marker.style.top).toBe('75%');
  expect(marker.getAttribute('aria-pressed')).toBe('true');
  expect(marker.textContent).toBe('');
  expect(marker.className).toContain('h-11 w-11');
  expect(marker.firstElementChild?.className).toContain('bg-transparent');
  expect(marker.firstElementChild?.className).toContain('hotspot-ring');
  expect(marker.firstElementChild?.className).not.toContain('animate-pulse');
  expect(screen.getByRole('heading', { name: 'Rose' })).toBeTruthy();
  const roseUrl = screen.getByRole('link', { name: 'View product' }).getAttribute('href');
  fireEvent.click(screen.getByRole('button', { name: 'Explore Lotus, hotspot 2' }));
  expect(screen.getByRole('heading', { name: 'Lotus' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'View product' }).getAttribute('href')).not.toBe(roseUrl);
  expect(screen.queryByText('₹200')).toBeNull();
  expect(screen.getByRole('list', { name: 'Products in this look' }).children).toHaveLength(2);
  expect(screen.getByRole('list', { name: 'Products in this look' }).className).toBe('sr-only focus-within:not-sr-only');
});

it('omits stale/deleted products and requires a custom cover with valid hotspots', () => {
  const { rerender } = render(<CategoryLook category={category} products={[]} />);
  expect(screen.queryByRole('region')).toBeNull();
  rerender(<CategoryLook category={{ ...category, coverImage: '' }} products={items} />);
  expect(screen.queryByRole('region')).toBeNull();
  rerender(<CategoryLook category={category} products={[items[0]]} />);
  expect(screen.getAllByRole('button')).toHaveLength(1);
});

it('keeps product links available after an image loading failure', () => {
  render(<CategoryLook category={category} products={items} />);
  fireEvent.error(screen.getByAltText('Decor styled collection'));
  expect(screen.getByRole('alert').textContent).toContain('could not load');
  expect(screen.getByRole('link', { name: 'View product' })).toBeTruthy();
});
