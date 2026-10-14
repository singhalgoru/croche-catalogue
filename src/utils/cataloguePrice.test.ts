import { describe, expect, it } from 'vitest';
import type { Product } from '../types/product';
import { getCataloguePriceBands, getCatalogueProductPrice, matchesCataloguePriceRange } from './cataloguePrice';

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

  it('creates up to four non-empty bands from displayed product prices', () => {
    const products = [100, 200, 300, 400, 500, 600, 700, 800].map((price, index) => ({
      ...product,
      id: `p${index}`,
      price,
      variants: [{ ...product.variants[0], price: null }],
    }));
    const bands = getCataloguePriceBands(products);
    expect(bands).toHaveLength(4);
    expect(bands.map(band => band.label)).toEqual([
      'Up to ₹250', '₹251–₹450', '₹451–₹650', '₹651+',
    ]);
    for (const item of products) {
      const matchingBands = bands.filter(band => matchesCataloguePriceRange(item, band));
      expect(matchingBands).toHaveLength(1);
    }
  });

  it('creates a precise range when only one priced level is available', () => {
    expect(getCataloguePriceBands([product])).toEqual([
      { minimum: 300, maximum: 300, label: '₹300' },
    ]);
  });

  it('omits ranges when no priced products are available', () => {
    expect(getCataloguePriceBands([{ ...product, showPrice: false }])).toEqual([]);
  });
});
