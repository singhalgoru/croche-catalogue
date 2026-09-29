import { describe, expect, it } from 'vitest';
import prefetchSource from '../../public/catalogue-prefetch.js?raw';
import { CATALOGUE_ORDER_QUERY, getNewProductSortOrder } from './catalogueOrder';

describe('getNewProductSortOrder', () => {
  it('places a new product ahead of the current first product', () => {
    expect(getNewProductSortOrder(0)).toBeLessThan(0);
    expect(getNewProductSortOrder(5)).toBeLessThan(5);
  });

  it('keeps working after the admin has dragged items into a new order', () => {
    // Reordering renormalises every sort_order to 0..n-1, so the lowest is 0.
    expect(getNewProductSortOrder(0)).toBe(-1);
  });

  it('stays ahead of products already pushed to the front', () => {
    expect(getNewProductSortOrder(-1)).toBe(-2);
  });

  it('defaults to the front for an empty catalogue', () => {
    expect(getNewProductSortOrder(null)).toBe(-1);
    expect(getNewProductSortOrder(undefined)).toBe(-1);
  });
});

describe('catalogue prefetch ordering', () => {
  it('matches the ordering the app query uses', () => {
    expect(prefetchSource).toContain(`order: '${CATALOGUE_ORDER_QUERY}'`);
  });
});
