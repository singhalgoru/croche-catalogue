import { expect, it } from 'vitest';
import { products } from '../data/products';
import { getCategoryShareHotspots } from './categoryShare';

it('only includes markers for current products belonging to the shared regular or seasonal category', () => {
  const first = { ...products[0], id: 'rose', category: 'Decor' };
  const other = { ...products[0], id: 'other', category: 'Charms' };
  const spots = [{ productId: 'rose', x: 25, y: 60 }, { productId: 'other', x: 50, y: 50 }];
  const settings = [{ name: 'Decor', priority: 1, coverImage: '/decor.webp', imageHotspots: spots },
    { name: 'Festive', priority: 1, isSeasonal: true, productIds: ['other'], coverImage: '/festive.webp', imageHotspots: spots }];
  expect(getCategoryShareHotspots('Decor', [first, other], settings).map(spot => spot.productId)).toEqual(['rose']);
  expect(getCategoryShareHotspots('Festive', [first, other], settings).map(spot => spot.productId)).toEqual(['other']);
  expect(getCategoryShareHotspots('All', [first, other], settings)).toEqual([]);
});
