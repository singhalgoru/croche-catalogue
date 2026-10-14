import { describe, expect, it } from 'vitest';
import type { DeliveryEstimate } from '../types/cart';
import { formatEstimatedDeliveryDateRange } from './deliveryEstimate';

const estimate: DeliveryEstimate = {
  provider: 'shiprocket',
  currency: 'INR',
  minCharge: 61,
  maxCharge: 90,
  minDays: 3,
  maxDays: 5,
  weightGrams: 500,
  itemCount: 1,
  checkedAt: '',
};

describe('estimated delivery date range', () => {
  it('combines pincode transit time with the one-to-five-day preparation window', () => {
    expect(formatEstimatedDeliveryDateRange(
      estimate,
      new Date('2026-10-14T08:30:00.000Z'),
    )).toBe('18 Oct 2026–24 Oct 2026');
  });

  it('handles date ranges that cross into a new year', () => {
    expect(formatEstimatedDeliveryDateRange(
      { ...estimate, minDays: 2, maxDays: 4 },
      new Date('2026-12-30T12:00:00.000Z'),
    )).toBe('2 Jan 2027–8 Jan 2027');
  });

  it('does not create date promises when courier transit days are incomplete or invalid', () => {
    expect(formatEstimatedDeliveryDateRange({ ...estimate, minDays: null })).toBeNull();
    expect(formatEstimatedDeliveryDateRange({ ...estimate, maxDays: null })).toBeNull();
    expect(formatEstimatedDeliveryDateRange({ ...estimate, minDays: 6, maxDays: 5 })).toBeNull();
  });
});
