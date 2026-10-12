import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import type { Product } from '../types/product';
import CategoryTiles from './CategoryTiles';

afterEach(cleanup);
const product: Product = {
  id: 'a', name: 'Charm', category: 'Charms & Keychains', price: 100,
  description: '', color: '#ffffff', inStock: false, image: '/sold.webp', variants: [],
};

it('preserves category order, links and prefers available product images', () => {
  const available = { ...product, id: 'b', inStock: true, image: '/available.webp' };
  render(<CategoryTiles categories={['Toys', 'Charms & Keychains', 'Empty']}
    products={[product, available, { ...product, id: 'toy', category: 'Toys' }]} />);
  const links = screen.getAllByRole('link');
  expect(links.map(link => link.textContent)).toEqual(['Toys', 'Charms & Keychains']);
  expect(links[1].getAttribute('href')).toContain('/collections/charms-keychains/');
  expect(links[1].querySelector('img')?.getAttribute('src')).toContain('available');
  expect(links[0].querySelector('img')?.getAttribute('loading')).toBe('lazy');
});

it('uses a full custom seasonal cover and falls back after it is removed', () => {
  const settings = [{ name: 'Festive', priority: 1, isSeasonal: true, productIds: ['a'], coverImage: '/season.webp' }];
  const { rerender } = render(<CategoryTiles categories={['Festive']} products={[product]} categorySettings={settings} />);
  const image = screen.getByRole('link').querySelector('img');
  expect(image?.getAttribute('src')).toContain('season.webp');
  expect(image?.classList.contains('object-contain')).toBe(true);
  rerender(<CategoryTiles categories={['Festive']} products={[product]} categorySettings={[{ ...settings[0], coverImage: '' }]} />);
  expect(image?.getAttribute('src')).toContain('sold.webp');
});
