import { expect, it } from 'vitest';
import { normalizeDeliveryPin } from './deliveryPin';

it('accepts only six-digit Indian PIN shapes or an explicit blank', () => {
  expect(normalizeDeliveryPin(' 110001 ')).toBe('110001');
  expect(normalizeDeliveryPin('  ')).toBeNull();
  for (const pin of ['000000', '12345', '1234567', '11A001', '110\n01']) {
    expect(() => normalizeDeliveryPin(pin)).toThrow('6-digit');
  }
});
