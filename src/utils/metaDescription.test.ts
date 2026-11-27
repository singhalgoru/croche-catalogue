import { expect, it } from 'vitest';
import { getBoundedMetaDescription } from './metaDescription.js';

it('preserves short descriptions and bounds long descriptions at a word boundary', () => {
  expect(getBoundedMetaDescription('  Handmade   crochet gifts.  ')).toBe('Handmade crochet gifts.');
  const description = getBoundedMetaDescription('Handmade crochet gifts '.repeat(20));
  expect(description.length).toBeLessThanOrEqual(155);
  expect(description).toMatch(/gifts…$|crochet…$|Handmade…$/);
  expect(getBoundedMetaDescription('x'.repeat(200))).toHaveLength(155);
});
