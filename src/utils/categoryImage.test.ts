import { expect, it } from 'vitest';
import { getCategoryHotspots, getCategoryImage, getHotspotRingOverlay } from './categoryImage.js';
import { products } from '../data/products';

it('uses optional custom images for both regular and seasonal categories', () => {
  for (const isSeasonal of [false, true]) {
    expect(getCategoryImage(products, { name: 'Test', priority: 1, isSeasonal, coverImage: '/cover.webp' })).toBe('/cover.webp');
  }
});
it('excludes stale markers and draws small hollow rings without fill, glow or numbers', () => {
  const category = { name: 'Test', priority: 1, coverImage: '/look.webp', imageHotspots: [
    { productId: products[0].id, x: 25, y: 60 },
    { productId: 'deleted', x: 50, y: 50 },
    { productId: products[0].id, x: -1, y: 50 },
  ] };
  const spots = getCategoryHotspots(products, category);
  expect(spots).toHaveLength(1);
  const overlay = getHotspotRingOverlay(600, 900, spots);
  expect(overlay.svg).not.toContain('<text');
  expect(overlay.svg.match(/<circle /g)).toHaveLength(2);
  expect(overlay.svg.match(/fill="none"/g)).toHaveLength(2);
  expect(overlay.svg).not.toContain('#edc357');
  expect(overlay.svg).toContain('cx="156" cy="546"');
  expect(overlay.width).toBe(612);
  expect(overlay.height).toBe(912);
  expect(getCategoryHotspots(products, { ...category, coverImage: '' })).toEqual([]);
});

it('falls back to the first product image by saved order, independent of stock and featured status', () => {
  const later = { ...products[0], sortOrder: 20, inStock: true, featured: true, image: '/later.webp' };
  const first = { ...products[0], sortOrder: 1, inStock: false, image: '/first.webp' };
  expect(getCategoryImage([later, first])).toBe('/first.webp');
  expect(getCategoryImage([later, { ...first, image: '' }])).toBe('/later.webp');
  expect(getCategoryImage([])).toBe('');
});
