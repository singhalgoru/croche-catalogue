import { describe, expect, it } from 'vitest';
import type { Product } from '../types/product';
import { getCatalogueProductPrice, matchesCataloguePriceRange } from './cataloguePrice';

const product: Product = {
  id: 'p1', name: 'Crochet flower', category: 'Decor', price: 250, showPrice: true,
  description: '', color: '#fff', inStock: true, image: '/flower.webp',
  variants: [{
    id: 'v1', name: 'Pink', color: '#f0a', price: 300, inStock: true, availableQuantity: 2,
    image: '/flower.webp', imagePath: '/flower.webp', gallery: [],
  }],
};

describe('catalogue price filter', () => {
  it('uses the same initial variant price shown on the product card', () => {
    expect(getCatalogueProductPrice(product)).toBe(300);
    expect(matchesCataloguePriceRange(product, { minimum: 300, maximum: 300 })).toBe(true);
    expect(matchesCataloguePriceRange(product, { minimum: 301, maximum: null })).toBe(false);
  });

  it('includes each bound and leaves the catalogue unchanged when no range is selected', () => {
    expect(matchesCataloguePriceRange(product, { minimum: 300, maximum: 300 })).toBe(true);
    expect(matchesCataloguePriceRange(product, { minimum: null, maximum: 300 })).toBe(true);
    expect(matchesCataloguePriceRange(product, null)).toBe(true);
  });

  it('excludes enquiry-only products from an active price range', () => {
    const enquiryOnly = { ...product, showPrice: false };
    expect(getCatalogueProductPrice(enquiryOnly)).toBeNull();
    expect(matchesCataloguePriceRange(enquiryOnly, { minimum: 0, maximum: 500 })).toBe(false);
  });
});
