import { describe, expect, it } from 'vitest';
import type { Product } from '../types/product';
import { matchesProductSearch } from './productSearch';

const product: Product = {
  id: 'product-1',
  name: 'Cute Bunny',
  category: 'Toys',
  price: 600,
  description: 'Handmade crochet plush for gifting.',
  color: '#f6c453',
  inStock: true,
  image: '/bunny.jpg',
  variants: [
    {
      id: 'variant-1',
      name: 'Pink overalls',
      color: '#f6c453',
      inStock: true,
      image: '/bunny.jpg',
      imagePath: 'bunny.jpg',
      gallery: [],
    },
  ],
};

describe('matchesProductSearch', () => {
  it('matches product category names', () => {
    expect(matchesProductSearch(product, 'toys')).toBe(true);
  });

  it('matches product names, descriptions, and variant names', () => {
    expect(matchesProductSearch(product, 'bunny')).toBe(true);
    expect(matchesProductSearch(product, 'plush')).toBe(true);
    expect(matchesProductSearch(product, 'overalls')).toBe(true);
  });

  it('ignores surrounding spaces and letter case', () => {
    expect(matchesProductSearch(product, '  TOYS  ')).toBe(true);
  });

  it('does not match unrelated terms', () => {
    expect(matchesProductSearch(product, 'anklet')).toBe(false);
  });
});
