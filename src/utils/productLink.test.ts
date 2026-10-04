import { afterEach, describe, expect, it } from 'vitest';
import type { Product } from '../types/product';
import { findProductByReference, readProductPageReference, toProductUrl, toProductPageUrl, toProductReference } from './productLink';

afterEach(() => window.history.replaceState(null, '', '/'));

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

describe('toProductPageUrl', () => {
  it('links to the prerendered product page so previews show the product photo', () => {
    const product = createProduct('8CE989F9-95a8', 'Bunny Toy');
    expect(toProductPageUrl(product)).toBe(
      `${window.location.origin}/p/bunny-toy/`,
    );
  });

  it('uses the persisted public slug for clean links after a product rename', () => {
    const renamed = { ...products[0], name: 'Rose Charm Deluxe', publicSlug: 'rose-charm' };
    expect(toProductPageUrl(renamed)).toBe(`${window.location.origin}/p/rose-charm/`);
    expect(findProductByReference([renamed], 'rose-charm')).toBe(renamed);
    expect(findProductByReference([renamed], 'rose-charm--11111111-1111-4111-8111-111111111111')).toBe(renamed);
  });

  describe('hybrid product routes', () => {
    it('reads direct product paths and preserves the immutable reference', () => {
      window.history.replaceState(null, '', '/p/old-name--product-1/?variant=red');
      expect(readProductPageReference()).toBe('old-name--product-1');
    });

    it('reads the bootstrap query for pages not built yet', () => {
      window.history.replaceState(null, '', '/?productPage=new-product--product-2');
      expect(readProductPageReference()).toBe('new-product--product-2');
    });

    it('leaves legacy catalogue popup links as popup routes', () => {
      window.history.replaceState(null, '', '/#product=rose--product-1');
      expect(readProductPageReference()).toBeNull();
    });

    it('uses full pages for links copied from admin or cart', () => {
      expect(toProductUrl(products[0])).toBe(toProductPageUrl(products[0]));
    });
  });
});
