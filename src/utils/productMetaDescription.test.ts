import { describe, expect, it } from 'vitest';
import { getProductMetaDescription } from './productMetaDescription';

const product = { name: 'Bunny Toy', category: 'Toys', description: '' };

describe('getProductMetaDescription', () => {
  it('preserves short complete descriptions and normalizes whitespace', () => {
    expect(getProductMetaDescription({ ...product, description: '  Handmade bunny. \n Custom colours available. ' }))
      .toBe('Handmade bunny. Custom colours available.');
  });

  it('uses a complete first sentence rather than cutting the next sentence', () => {
    expect(getProductMetaDescription({ ...product, description: `Handmade bunny. ${'More product details '.repeat(20)}.` }))
      .toBe('Handmade bunny.');
  });

  it.each(['', 'A bunny without sentence-ending punctuation', `${'Long descriptive text '.repeat(20)}.`, `${'Long descriptive text '.repeat(20)}.Colors can be customised.`])(
    'uses known product identity when a concise complete sentence is unavailable',
    (description) => {
      const summary = getProductMetaDescription({ ...product, description });
      expect(summary).toBe("Bunny Toy: handmade crochet from Luvia Creations' Toys collection. Shipped across India.");
      expect(summary.length).toBeLessThanOrEqual(160);
      expect(summary).not.toContain('…');
    },
  );
});
