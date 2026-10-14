import { describe, expect, it } from 'vitest';
import type { Product } from '../types/product';
import { getCataloguePriceBands, getCataloguePriceRangeLabel, getCatalogueProductPrice, matchesCataloguePriceRange } from './cataloguePrice';

const product: Product = {
  id: 'p1', name: 'Crochet flower', category: 'Decor', price: 250, showPrice: true,
  description: '', color: '#fff', inStock: true, image: '/flower.webp',
  variants: [{
    id: 'v1', name: 'Pink', color: '#f0a', price: 300, inStock: true, availableQuantity: 2,
    image: '/flower.webp', imagePath: '/flower.webp', gallery: [],
  }],
};

describe('catalogue price filter', () => {
  it.each([
    [{ minimum: null, maximum: null }, 'Any price'],
    [{ minimum: null, maximum: 200 }, 'Up to ₹200'],
    [{ minimum: 0, maximum: 200 }, 'Up to ₹200'],
    [{ minimum: 200, maximum: 400 }, '₹200–₹400'],
    [{ minimum: 400, maximum: null }, '₹400+'],
    [{ minimum: 300, maximum: 300 }, '₹300'],
    [{ minimum: 0, maximum: 0 }, '₹0'],
  ])('formats ranges consistently across filter surfaces: %s', (range, label) => {
    expect(getCataloguePriceRangeLabel(range)).toBe(label);
  });

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
      'Up to ₹300', '₹300–₹500', '₹500–₹700', '₹700+',
    ]);
    for (const item of products) {
      const matchingBands = bands.filter(band => matchesCataloguePriceRange(item, band));
      expect(matchingBands.length).toBeGreaterThanOrEqual(1);
    }
    for (const band of bands) {
      expect(band.minimum! % 100).toBe(0);
      if (band.maximum !== null) expect(band.maximum % 100).toBe(0);
      expect(products.some(item => matchesCataloguePriceRange(item, band))).toBe(true);
    }
  });

  it('includes shared round-number boundaries in either adjacent suggestion', () => {
    const products = [100, 300, 500, 800].map(price => ({
      ...product, price, variants: [{ ...product.variants[0], price: null }],
    }));
    const bands = getCataloguePriceBands(products);
    expect(bands.map(band => band.label)).toEqual([
      'Up to ₹200', '₹200–₹400', '₹400–₹700', '₹700+',
    ]);
    const boundaryProduct = { ...products[0], price: 200 };
    expect(matchesCataloguePriceRange(boundaryProduct, bands[0])).toBe(true);
    expect(matchesCataloguePriceRange(boundaryProduct, bands[1])).toBe(true);
  });

  it.each([
    [[349], ['₹300–₹400']],
    [[310, 349, 375, 399], ['₹300–₹400']],
    [[0, 25, 75], ['Up to ₹100']],
    [[199, 200, 201, 202], ['Up to ₹200', '₹200+']],
  ])('merges nearby prices into populated rounded ranges: %s', (prices, labels) => {
    const products = prices.map(price => ({
      ...product, price, variants: [{ ...product.variants[0], price: null }],
    }));
    const bands = getCataloguePriceBands(products);
    expect(bands.map(band => band.label)).toEqual(labels);
    expect(bands.length).toBeLessThanOrEqual(4);
    for (const band of bands) {
      expect(products.some(item => matchesCataloguePriceRange(item, band))).toBe(true);
    }
    for (const item of products) {
      expect(bands.some(band => matchesCataloguePriceRange(item, band))).toBe(true);
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
