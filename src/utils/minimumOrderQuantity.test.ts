import { describe, expect, it } from 'vitest';
import {
  clampCartQuantity,
  getNextCartQuantity,
  normalizeMinimumOrderQuantity,
} from './minimumOrderQuantity';

describe('minimum order quantity', () => {
  it('uses one as the default and bounds saved quantities to the cart range', () => {
    expect(normalizeMinimumOrderQuantity(undefined)).toBe(1);
    expect(normalizeMinimumOrderQuantity(0)).toBe(1);
    expect(normalizeMinimumOrderQuantity(120)).toBe(99);
  });

  it('starts product additions at the minimum and increments existing cart lines', () => {
    expect(getNextCartQuantity(0, 4)).toBe(4);
    expect(getNextCartQuantity(4, 4)).toBe(5);
    expect(getNextCartQuantity(99, 4)).toBe(99);
  });

  it('clamps cart edits to the minimum order quantity', () => {
    expect(clampCartQuantity(1, 4)).toBe(4);
    expect(clampCartQuantity(6, 4)).toBe(6);
  });
});
