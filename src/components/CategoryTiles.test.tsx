import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Product } from '../types/product';
import CategoryTiles from './CategoryTiles';

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const product: Product = {
  id: 'a', name: 'Charm', category: 'Charms & Keychains', price: 100,
  description: '', color: '#ffffff', inStock: false, image: '/sold.webp', variants: [],
};

it('preserves category order, links and prefers available product images', () => {
  const available = { ...product, id: 'b', inStock: true, image: '/available.webp' };
  render(<CategoryTiles categories={['Toys', 'Charms & Keychains', 'Empty']}
    products={[product, available, { ...product, id: 'toy', category: 'Toys' }]} />);
  const links = within(screen.getByRole('navigation', { name: 'Explore collections' })).getAllByRole('link');
  expect(links.map(link => link.textContent)).toEqual(['Toys', 'Charms & Keychains']);
  expect(links[1].getAttribute('href')).toContain('/collections/charms-keychains/');
  expect(links[1].querySelector('img')?.getAttribute('src')).toContain('available');
  expect(links[0].querySelector('img')?.getAttribute('loading')).toBe('lazy');
});
it('places seasonal categories first even when supplied after regular categories', () => {
  render(<CategoryTiles categories={['Charms & Keychains', 'Festive']}
    products={[product]} categorySettings={[{ name: 'Festive', priority: 999, isSeasonal: true, productIds: ['a'] }]} />);
  const nav = screen.getByRole('navigation', { name: 'Explore collections' });
  expect(within(nav).getAllByRole('link').map(link => link.textContent)).toEqual(['Festive', 'Charms & Keychains']);
});

it('pins the seasonal category at one place with a glowing card halo while remaining categories rotate', () => {
  const settings = [{ name: 'Festive', priority: 1, isSeasonal: true, productIds: ['a'] }];
  render(<CategoryTiles categories={['Charms & Keychains', 'Festive', 'Toys']} products={[product]} categorySettings={settings} />);
  const festiveLink = screen.getByRole('link', { name: 'Festive' });
  expect(festiveLink.classList.contains('card-seasonal-glow')).toBe(true);
  const pinnedContainer = festiveLink.closest('[data-pinned="true"]');
  expect(pinnedContainer).not.toBeNull();
  expect(pinnedContainer?.classList.contains('sticky')).toBe(true);
});

it('uses a full custom seasonal cover and falls back after it is removed', () => {
  const settings = [{ name: 'Festive', priority: 1, isSeasonal: true, productIds: ['a'], coverImage: '/season.webp' }];
  const { rerender } = render(<CategoryTiles categories={['Festive']} products={[product]} categorySettings={settings} />);
  const image = screen.getByRole('link', { name: 'Festive' }).querySelector('img');
  expect(image?.getAttribute('src')).toContain('season.webp');
  expect(image?.classList.contains('object-contain')).toBe(true);
  rerender(<CategoryTiles categories={['Festive']} products={[product]} categorySettings={[{ ...settings[0], coverImage: '' }]} />);
  expect(image?.getAttribute('src')).toContain('sold.webp');
});

it('provides manual scrolling, edge controls, reduced-motion support and a view-all link', () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  render(<CategoryTiles categories={['Charms & Keychains']} products={[product]} />);
  const nav = screen.getByRole('navigation', { name: 'Explore collections' });
  Object.defineProperties(nav, { clientWidth: { value: 500 }, scrollWidth: { value: 1000 },
    scrollLeft: { value: 0, writable: true } });
  const scrollBy = vi.fn();
  nav.scrollBy = scrollBy;
  fireEvent.scroll(nav);
  const previous = screen.getByRole('button', { name: 'Previous collections' });
  const next = screen.getByRole('button', { name: 'Next collections' });
  expect(screen.getByRole('button', { name: 'Resume collection rotation' })).toHaveProperty('disabled', true);
  expect(previous).toHaveProperty('disabled', true);
  expect(next).toHaveProperty('disabled', false);
  fireEvent.click(next);
  expect(scrollBy).toHaveBeenCalledWith({ left: 400, behavior: 'instant' });
  nav.scrollLeft = 500;
  fireEvent.scroll(nav);
  expect(next).toHaveProperty('disabled', true);
  fireEvent.click(previous);
  expect(scrollBy).toHaveBeenLastCalledWith({ left: -400, behavior: 'instant' });
  expect(screen.getByRole('link', { name: 'View all' }).getAttribute('href')).toBe('/collections/');
});

it('glides continuously at 26px per second, loops seamlessly and pauses safely', () => {
  vi.useFakeTimers();
  const categories = ['A', 'B', 'C', 'D', 'E', 'F'];
  render(<CategoryTiles categories={categories} products={categories.map(category => ({ ...product, id: category, category }))} />);
  const nav = screen.getByRole('navigation', { name: 'Explore collections' });
  const section = screen.getByRole('region', { name: 'Explore collections' });
  Object.defineProperties(nav, { clientWidth: { value: 500 }, scrollWidth: { value: 2304 },
    scrollLeft: { value: 0, writable: true } });
  nav.style.columnGap = '12px';
  vi.spyOn(nav.querySelector('a')!, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 180, 180));
  fireEvent.scroll(nav);
  expect(nav.querySelectorAll('a[aria-hidden="true"][tabindex="-1"]')).toHaveLength(6);
  expect(within(nav).getAllByRole('link')).toHaveLength(6);
  act(() => vi.advanceTimersByTime(2000));
  expect(nav.scrollLeft).toBeCloseTo(52, 0);
  const first = nav.scrollLeft;
  act(() => vi.advanceTimersByTime(2000));
  expect(nav.scrollLeft - first).toBeCloseTo(52, 0);
  nav.scrollLeft = 1150;
  fireEvent.scroll(nav);
  act(() => vi.advanceTimersByTime(1000));
  expect(nav.scrollLeft).toBeGreaterThan(15);
  expect(nav.scrollLeft).toBeLessThan(35);
  fireEvent.mouseEnter(section);
  const stopped = nav.scrollLeft;
  act(() => vi.advanceTimersByTime(5000));
  expect(nav.scrollLeft).toBe(stopped);
  fireEvent.focus(nav.querySelector('a')!);
  fireEvent.mouseLeave(section);
  act(() => vi.advanceTimersByTime(5000));
  expect(nav.scrollLeft).toBe(stopped);
  fireEvent.blur(nav.querySelector('a')!, { relatedTarget: null });
  fireEvent.click(screen.getByRole('button', { name: 'Pause collection rotation' }));
  act(() => vi.advanceTimersByTime(5000));
  expect(nav.scrollLeft).toBe(stopped);
  fireEvent.click(screen.getByRole('button', { name: 'Resume collection rotation' }));
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  act(() => vi.advanceTimersByTime(5000));
  expect(nav.scrollLeft).toBe(stopped);
  vi.restoreAllMocks();
  fireEvent.touchStart(section);
  act(() => vi.advanceTimersByTime(5000));
  expect(nav.scrollLeft).toBe(stopped);
  fireEvent.touchEnd(section);
  act(() => vi.advanceTimersByTime(2000));
  expect(nav.scrollLeft - stopped).toBeCloseTo(52, 0);
});
