import { describe, expect, it } from 'vitest';
import type { Product } from '../types/product';
import { getRelatedProducts } from './relatedProducts';

const product: Product = {
  id: 'current', name: 'Coaster', category: 'Home', price: 100, description: '',
  color: '#ffffff', inStock: true, image: '/coaster.webp', variants: [],
};
const candidate = (id: string, patch: Partial<Product> = {}): Product => ({ ...product, id, ...patch });

describe('getRelatedProducts', () => {
  it('excludes the current product and unrelated categories without changing catalogue order', () => {
    const products = [product, candidate('other', { category: 'Toys' }), candidate('related')];
    expect(getRelatedProducts(product, products).map(item => item.id)).toEqual(['related']);
    expect(products.map(item => item.id)).toEqual(['current', 'other', 'related']);
  });

  it('prioritises in-stock products then newest publications and returns at most four', () => {
    const products = [
      candidate('sold-out-new', { inStock: false, publishedAt: '2026-10-03' }),
      candidate('old', { publishedAt: '2026-01-01' }),
      candidate('new', { publishedAt: '2026-10-02' }),
      candidate('unknown', { publishedAt: null }),
      candidate('invalid', { publishedAt: 'invalid' }),
      candidate('sold-out-old', { inStock: false, publishedAt: '2025-01-01' }),
    ];
    expect(getRelatedProducts(product, products).map(item => item.id)).toEqual(['new', 'old', 'invalid', 'unknown']);
    expect(getRelatedProducts(product, [products[0], products[5]]).map(item => item.id))
      .toEqual(['sold-out-new', 'sold-out-old']);
  });

  it('does not fill gaps with unrelated products', () => {
    expect(getRelatedProducts(product, [product, candidate('toy', { category: 'Toys' })])).toEqual([]);
  });
});
