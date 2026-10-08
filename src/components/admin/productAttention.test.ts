import { describe, expect, it } from 'vitest';
import { getProductAttention } from './productAttention';
import { DEFAULT_PRICE_DISCOVERY_DEFAULTS, createDefaultPriceInputs } from './priceDiscovery';
import type { ManagedProduct } from '../../services/products';

const product = {
  inStock: true,
  profitMarginPercent: 35,
  gstPercent: 5,
  priceDiscoveryInputs: {
    ...createDefaultPriceInputs(), timeSpent: '0', materialCost: '0',
  },
  variants: [],
};
const check = (input = product) => getProductAttention(input, DEFAULT_PRICE_DISCOVERY_DEFAULTS);
const variant = (availableQuantity: number, inStock = true): ManagedProduct['variants'][number] => ({
  id: 'variant', name: 'Pink', color: '#ffffff', price: null,
  image: '/test.webp', imagePath: 'test.webp', gallery: [], availableQuantity, inStock,
});

describe('product attention checks', () => {
  it.each([
    [-10, true], [-0.01, true], [0, false], [10, false],
    [null, false], [undefined, false], [NaN, false], [-Infinity, false],
  ])('flags a negative saved margin of %s only when finite and below zero', (profitMarginPercent, flagged) => {
    expect(getProductAttention({ ...product, profitMarginPercent }, DEFAULT_PRICE_DISCOVERY_DEFAULTS).negativeMargin).toBe(flagged);
  });
  it('uses the exact saved margin threshold, including negative margins', () => {
    expect(check().margin).toBe(false);
    for (const profitMarginPercent of [34.99, 0, -10]) {
      expect(check({ ...product, profitMarginPercent }).margin).toBe(true);
    }
    expect(check({ ...product, profitMarginPercent: NaN }).margin).toBe(false);
    expect(getProductAttention({ ...product, profitMarginPercent: null }, DEFAULT_PRICE_DISCOVERY_DEFAULTS).margin).toBe(false);
  });

  it('accepts zero costs but flags incomplete or invalid saved pricing inputs', () => {
    expect(check().costs).toBe(false);
    for (const materialCost of ['', '-1', 'invalid']) {
      expect(check({ ...product, priceDiscoveryInputs: { ...product.priceDiscoveryInputs, materialCost } }).costs).toBe(true);
    }
    expect(getProductAttention({ ...product, priceDiscoveryInputs: null }, DEFAULT_PRICE_DISCOVERY_DEFAULTS).costs).toBe(true);
  });

  it('counts low and unavailable variants separately without double counting', () => {
    const result = getProductAttention({
      ...product,
      variants: [variant(1), variant(2), variant(3), variant(4), variant(0), variant(5, false)],
    }, DEFAULT_PRICE_DISCOVERY_DEFAULTS);
    expect(result.stock).toBe(true);
    expect(result.lowStockCount).toBe(2);
    expect(result.outOfStockCount).toBe(2);
    expect(getProductAttention({ ...product, variants: [variant(4)] }, DEFAULT_PRICE_DISCOVERY_DEFAULTS).stock).toBe(false);
    expect(check({ ...product, inStock: false }).stock).toBe(true);
  });

  it.each([
    [0, true, 0, 1],
    [1, true, 1, 0],
    [2, true, 1, 0],
    [3, false, 0, 0],
    [4, false, 0, 0],
  ])('flags quantity %s only when below three', (quantity, flagged, lowStockCount, outOfStockCount) => {
    const result = getProductAttention({
      ...product, variants: [variant(quantity)],
    }, DEFAULT_PRICE_DISCOVERY_DEFAULTS);
    expect(result.stock).toBe(flagged);
    expect(result.lowStockCount).toBe(lowStockCount);
    expect(result.outOfStockCount).toBe(outOfStockCount);
  });
});
