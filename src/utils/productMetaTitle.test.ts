import { describe, expect, it } from 'vitest';
import { getBoundedMetaTitle, getProductMetaTitle } from './productMetaTitle.js';

describe('getProductMetaTitle', () => {
  it('keeps content-page titles within 60 characters', () => {
    expect(getBoundedMetaTitle('A thoughtfully written guide about handmade crochet accessories').length)
      .toBeLessThanOrEqual(60);
  });

  it('uses the product, category and brand when the full title fits', () => {
    expect(getProductMetaTitle({ name: 'OG Mogra Gajra', category: 'Hair Accessories' }))
      .toBe('OG Mogra Gajra | Handmade Crochet Hair Accessories | Luvia');
  });

  it('keeps long titles within the search-result title limit and retains the brand', () => {
    const title = getProductMetaTitle({
      name: 'A very long handmade crochet accessory product name for a festive occasion',
      category: 'Charms & Keychains',
    });
    expect(title.length).toBeLessThanOrEqual(60);
    expect(title.endsWith(' | Crochet | Luvia')).toBe(true);
  });
});
