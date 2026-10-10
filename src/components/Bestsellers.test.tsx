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
afterEach(cleanup);
beforeEach(() => rpc.mockReset());

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
});

it('hides when fewer than two available catalogue products qualify', async () => {
  rpc.mockResolvedValue({ data: [{ product_id: 'a' }, { product_id: 'b' }, { product_id: 'hidden' }], error: null });
  const unavailable = product('b');
  unavailable.variants[0].availableQuantity = 0;
  render(<Bestsellers products={[product('a'), unavailable]} onSelect={vi.fn()} />);
  await waitFor(() => expect(rpc).toHaveBeenCalled());
  expect(screen.queryByRole('heading')).toBeNull();
});

it('logs API failures without displaying misleading bestsellers', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  rpc.mockResolvedValue({ data: null, error: { message: 'Unavailable' } });
  render(<Bestsellers products={[product('a'), product('b')]} onSelect={vi.fn()} />);
  await waitFor(() => expect(log).toHaveBeenCalledWith('Unable to load bestsellers:', expect.any(Error)));
  expect(screen.queryByRole('heading')).toBeNull();
  log.mockRestore();
});
