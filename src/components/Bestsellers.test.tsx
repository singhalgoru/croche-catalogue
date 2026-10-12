import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Product } from '../types/product';
import Bestsellers from './Bestsellers';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../lib/supabaseConfig', () => ({
  isSupabaseConfigured: true, loadSupabase: async () => ({ rpc }),
}));
const product = (id: string): Product => ({
  id, name: `Product ${id}`, category: 'Toys', description: '', price: 120,
  showPrice: true, inStock: true, color: '#ffffff', image: '/photo.webp',
  variants: [{
    id: `${id}-variant`, name: 'Default', color: '#ffffff', price: null,
    inStock: true, availableQuantity: 3, image: '/photo.webp', imagePath: '', gallery: [],
  }],
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
beforeEach(() => {
  rpc.mockReset();
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});

it('preserves server ranking, links to products and supports selection', async () => {
  rpc.mockResolvedValue({ data: [{ product_id: 'b' }, { product_id: 'a' }], error: null });
  const onSelect = vi.fn();
  render(<Bestsellers products={[product('a'), product('b')]} onSelect={onSelect} />);
  await screen.findByRole('heading', { name: 'Bestsellers' });
  const links = screen.getAllByRole('link');
  expect(links[0].textContent).toContain('Product b');
  expect(links[0].getAttribute('href')).toContain('/p/');
  fireEvent.click(links[0], { ctrlKey: true });
  expect(onSelect).not.toHaveBeenCalled();
  fireEvent.click(links[0]);
  expect(onSelect).toHaveBeenCalledWith(product('b'));
  expect(screen.getByText('Popular over the last 90 days')).toBeTruthy();
  for (const image of screen.getAllByRole('img')) {
    expect(image.className).toContain('object-contain');
    expect(image.className).not.toContain('object-cover');
    const background = image.previousElementSibling;
    expect(background?.getAttribute('aria-hidden')).toBe('true');
    expect(background?.getAttribute('src')).toBe(image.getAttribute('src'));
  }
});

it('hides when fewer than two available catalogue products qualify', async () => {
  rpc.mockResolvedValue({ data: [{ product_id: 'a' }, { product_id: 'b' }, { product_id: 'hidden' }], error: null });
  const unavailable = product('b');
  unavailable.variants[0].availableQuantity = 0;
  render(<Bestsellers products={[product('a'), unavailable]} onSelect={vi.fn()} />);
  await waitFor(() => expect(rpc).toHaveBeenCalled());
  expect(screen.queryByRole('heading')).toBeNull();
});
it('shows exactly six distinct ranked products without inventing additional bestsellers', async () => {
  const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(product);
  rpc.mockResolvedValue({ data: ['b', 'b', 'a', 'f', 'c', 'd', 'e', 'g'].map(product_id => ({ product_id })), error: null });
  render(<Bestsellers products={items} onSelect={vi.fn()} />);
  await screen.findByRole('heading', { name: 'Bestsellers' });
  expect(screen.getAllByRole('link').map(link => link.textContent?.split('₹')[0])).toEqual([
    'Product b', 'Product a', 'Product f', 'Product c', 'Product d', 'Product e',
  ]);
  expect(screen.getByRole('button', { name: 'Next bestsellers' })).toBeTruthy();
});

it('logs API failures without displaying misleading bestsellers', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  rpc.mockResolvedValue({ data: null, error: { message: 'Unavailable' } });
  render(<Bestsellers products={[product('a'), product('b')]} onSelect={vi.fn()} />);
  await waitFor(() => expect(log).toHaveBeenCalledWith('Unable to load bestsellers:', expect.any(Error)));
  expect(screen.queryByRole('heading')).toBeNull();
  log.mockRestore();
});
