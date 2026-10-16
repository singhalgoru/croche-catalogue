import { expect, it } from 'vitest';
import { getCategoryHotspots, getCategoryImage } from './categoryImage.js';
import { products } from '../data/products';

it('uses optional custom images for both regular and seasonal categories', () => {
  for (const isSeasonal of [false, true]) {
    expect(getCategoryImage(products, { name: 'Test', priority: 1, isSeasonal, coverImage: '/cover.webp' })).toBe('/cover.webp');
  }
});
it('excludes stale markers and only shows hotspots on custom category covers', () => {
  const category = { name: 'Test', priority: 1, coverImage: '/look.webp', imageHotspots: [
    { productId: products[0].id, x: 25, y: 60 },
    { productId: 'deleted', x: 50, y: 50 },
    { productId: products[0].id, x: -1, y: 50 },
  ] };
  const spots = getCategoryHotspots(products, category);
  expect(spots).toHaveLength(1);
  expect(getCategoryHotspots(products, { ...category, coverImage: '' })).toEqual([]);
});

it('falls back to the first product image by saved order, independent of stock and featured status', () => {
  const later = { ...products[0], sortOrder: 20, inStock: true, featured: true, image: '/later.webp' };
  const first = { ...products[0], sortOrder: 1, inStock: false, image: '/first.webp' };
  expect(getCategoryImage([later, first])).toBe('/first.webp');
  expect(getCategoryImage([later, { ...first, image: '' }])).toBe('/later.webp');
  expect(getCategoryImage([])).toBe('');
});
