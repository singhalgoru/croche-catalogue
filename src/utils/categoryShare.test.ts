import { expect, it } from 'vitest';
import { products } from '../data/products';
import { getCategoryShareImageUrl } from './categoryShare';

it('shares the clean cover URL even when regular and seasonal categories have hotspots', () => {
  const first = { ...products[0], id: 'rose', category: 'Decor' };
  const other = { ...products[0], id: 'other', category: 'Charms' };
  const spots = [{ productId: 'rose', x: 25, y: 60 }, { productId: 'other', x: 50, y: 50 }];
  const settings = [{ name: 'Decor', priority: 1, coverImage: '/decor.webp', imageHotspots: spots },
    { name: 'Festive', priority: 1, isSeasonal: true, productIds: ['other'], coverImage: '/festive.webp', imageHotspots: spots }];
  expect(getCategoryShareImageUrl('Decor', [first, other], settings)).toBe('/decor.webp');
  expect(getCategoryShareImageUrl('Festive', [first, other], settings)).toBe('/festive.webp');
  expect(getCategoryShareImageUrl('All', [first, other], settings)).toBe('');
});
