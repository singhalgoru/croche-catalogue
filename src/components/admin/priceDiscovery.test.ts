import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRICE_DISCOVERY_DEFAULTS,
  calculatePriceAtSellingPrice,
  estimateProductPrice,
  roundPriceUp,
  type PriceDiscoveryInputs,
} from './priceDiscovery';

describe('price discovery calculations', () => {
  it('includes labour, material, shipping and packaging costs and accounts for GST and gateway fees', () => {
    const estimate = estimateProductPrice({
      timeSpent: '2',
      timeUnit: 'hours',
      materialCost: '100',
      shippingCost: '100',
      packagingCost: '100',
      gstPercent: '5',
    }, DEFAULT_PRICE_DISCOVERY_DEFAULTS);

    expect(estimate).not.toBeNull();
    expect(estimate?.labourCost).toBe(200);
    expect(estimate?.totalCost).toBe(500);
    expect(estimate?.targetBeforeGatewayFee).toBe(950);
    expect(estimate?.expectedNet).toBeCloseTo(950);
    expect(estimate?.customerTotal).toBeGreaterThan(estimate?.suggestedPriceBeforeGst ?? 0);
  });

  it('converts minutes to hours before calculating labour cost', () => {
    const inputs: PriceDiscoveryInputs = {
      timeSpent: '120',
      timeUnit: 'minutes',
      materialCost: '100',
      shippingCost: '100',
      packagingCost: '100',
      gstPercent: '5',
    };
    const minutesEstimate = estimateProductPrice(inputs, DEFAULT_PRICE_DISCOVERY_DEFAULTS);
    const hoursEstimate = estimateProductPrice({
      ...inputs,
      timeSpent: '2',
      timeUnit: 'hours',
    }, DEFAULT_PRICE_DISCOVERY_DEFAULTS);

    expect(minutesEstimate?.labourCost).toBe(200);
    expect(minutesEstimate?.totalCost).toBe(hoursEstimate?.totalCost);
    expect(minutesEstimate?.suggestedPriceBeforeGst).toBe(hoursEstimate?.suggestedPriceBeforeGst);
  });

  it('requires every cost and a verified GST rate', () => {
    expect(estimateProductPrice({
      timeSpent: '1', timeUnit: 'hours', materialCost: '50', shippingCost: '100', packagingCost: '100', gstPercent: '',
    }, DEFAULT_PRICE_DISCOVERY_DEFAULTS)).toBeNull();
    expect(estimateProductPrice({
      timeSpent: '-1', timeUnit: 'hours', materialCost: '50', shippingCost: '100', packagingCost: '100', gstPercent: '5',
    }, DEFAULT_PRICE_DISCOVERY_DEFAULTS)).toBeNull();
    expect(estimateProductPrice({
      timeSpent: '1', timeUnit: 'hours', materialCost: '50', shippingCost: '100', packagingCost: '100', gstPercent: '101',
    }, DEFAULT_PRICE_DISCOVERY_DEFAULTS)).toBeNull();
  });

  it('recalculates net profit and product margin for a custom price', () => {
    const inputs: PriceDiscoveryInputs = {
      timeSpent: '120',
      timeUnit: 'minutes',
      materialCost: '100',
      shippingCost: '100',
      packagingCost: '100',
      gstPercent: '5',
    };
    const outcome = calculatePriceAtSellingPrice(inputs, DEFAULT_PRICE_DISCOVERY_DEFAULTS, '1100');

    expect(outcome).not.toBeNull();
    expect(outcome?.totalCost).toBe(500);
    expect(outcome?.customerTotal).toBe(1155);
    expect(outcome?.profit).toBeCloseTo(572.742);
    expect(outcome?.profitMarginPercent).toBeCloseTo(52.06745);
  });

  it.each(['', '0', '-1', 'not-a-price'])('rejects invalid custom selling prices (%s)', (price) => {
    expect(calculatePriceAtSellingPrice({
      timeSpent: '1', timeUnit: 'hours', materialCost: '50', shippingCost: '100',
      packagingCost: '100', gstPercent: '5',
    }, DEFAULT_PRICE_DISCOVERY_DEFAULTS, price)).toBeNull();
  });

  it('rounds up so the selected price does not fall below the calculated suggestion', () => {
    expect(roundPriceUp(974.1, 5)).toBe(975);
    expect(roundPriceUp(1000, 10)).toBe(1000);
  });
});
