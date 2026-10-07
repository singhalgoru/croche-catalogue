import { describe, expect, it } from 'vitest';
import { getProductPublishError } from './productPublishValidation';

const complete = {
  name: 'Rose', category: 'Flowers', description: 'Handmade crochet rose.',
  materials: 'Cotton yarn', includedItems: 'One stem', showPrice: true, price: 100,
};

describe('publication requirements', () => {
  it.each(['name', 'category', 'description', 'materials', 'includedItems'] as const)(
    'requires nonblank %s', field => {
      expect(getProductPublishError({ ...complete, [field]: '  ' })).not.toBeNull();
    },
  );
  it('permits price-on-request but requires a positive whole-rupee displayed price', () => {
    expect(getProductPublishError(complete)).toBeNull();
    expect(getProductPublishError({ ...complete, price: null, showPrice: false })).toBeNull();
    for (const price of [null, 0, -1, 2.5, NaN]) {
      expect(getProductPublishError({ ...complete, price })).not.toBeNull();
    }
  });
});
