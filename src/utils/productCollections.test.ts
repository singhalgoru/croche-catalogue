import { describe, expect, it } from 'vitest';
import type { Product } from '../types/product';
import { getBestsellerProducts, getFeaturedProducts } from './productCollections.js';

const product = (id: string, sortOrder = 0, featured = true, quantity = 2): Product => ({
  id, name: id, sortOrder, featured, category: 'Toys', description: '', price: 100,
  image: '/photo.webp', showPrice: true, inStock: true, color: '',
  variants: [{ id: `${id}-v`, name: 'Default', color: '', price: null, image: '/photo.webp',
    imagePath: '', gallery: [], inStock: true, availableQuantity: quantity }],
});

describe('shared curated product selection', () => {
  it('selects only purchasable featured items in stable manual order without mutating input', () => {
    const products = [product('later', 3), product('sold', 0, true, 0), product('plain', 0, false),
      product('b', 1), product('a', 1), { ...product('empty'), variants: [] }];
    expect(getFeaturedProducts(products).map(item => item.id)).toEqual(['a', 'b', 'later']);
    expect(products[0].id).toBe('later');
  });
  it('preserves bestseller rank, deduplicates, limits to six and excludes missing and sold out items', () => {
    const products = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(id => product(id));
    expect(getBestsellerProducts(products, ['b', 'b', 'a', 'c', 'd', 'e', 'f', 'g']).map(item => item.id))
      .toEqual(['b', 'a', 'c', 'd', 'e', 'f']);
    products[0].variants[0].inStock = false;
    expect(getBestsellerProducts(products, ['missing', 'a', 'b']).map(item => item.id)).toEqual(['b']);
    expect(getFeaturedProducts([])).toEqual([]);
  });
});
