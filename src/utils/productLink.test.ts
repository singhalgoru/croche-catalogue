import { describe, expect, it } from 'vitest';
import type { Product } from '../types/product';
import { findProductByReference, toProductReference } from './productLink';

const createProduct = (id: string, name: string): Product => ({
  id,
  name,
  category: 'Charms',
  price: 499,
  description: 'Handmade crochet piece.',
  color: 'Rose',
  inStock: true,
  image: 'https://example.com/rose.jpg',
  variants: [],
});

const products = [
  createProduct('11111111-1111-4111-8111-111111111111', 'Rose Charm'),
  createProduct('22222222-2222-4222-8222-222222222222', 'Flower Coaster'),
];

describe('toProductReference', () => {
  it('combines a readable slug with the immutable id', () => {
    expect(toProductReference(products[0])).toBe(
      'rose-charm--11111111-1111-4111-8111-111111111111',
    );
  });

  it('falls back to the id alone when the name has no usable characters', () => {
    expect(toProductReference(createProduct('product-9', '✨'))).toBe('product-9');
  });
});

describe('findProductByReference', () => {
  it('resolves a reference generated for the product', () => {
    expect(findProductByReference(products, toProductReference(products[1]))).toBe(products[1]);
  });

  it('still resolves after the product is renamed', () => {
    const renamed = [{ ...products[0], name: 'Rose Charm Deluxe' }, products[1]];
    expect(
      findProductByReference(renamed, 'rose-charm--11111111-1111-4111-8111-111111111111'),
    ).toBe(renamed[0]);
  });

  it('supports legacy slug-only links', () => {
    expect(findProductByReference(products, 'flower-coaster')).toBe(products[1]);
  });

  it('supports bare id links', () => {
    expect(findProductByReference(products, '22222222-2222-4222-8222-222222222222')).toBe(
      products[1],
    );
  });

  it('returns null when nothing matches', () => {
    expect(findProductByReference(products, 'not-a-product--missing-id')).toBeNull();
    expect(findProductByReference(products, '   ')).toBeNull();
  });
});
