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
      targetMarginPercent: '45',
    }, DEFAULT_PRICE_DISCOVERY_DEFAULTS);

    expect(estimate).not.toBeNull();
    expect(estimate?.labourCost).toBe(200);
    expect(estimate?.totalCost).toBe(500);
    expect(estimate?.expectedNet).toBeGreaterThan(estimate!.totalCost);
    expect(
      (estimate!.expectedNet - estimate!.totalCost)
      / (estimate!.customerTotal - estimate!.gstAmount) * 100,
    ).toBeCloseTo(45);
    expect(estimate?.customerTotal).toBe(estimate?.suggestedCustomerPrice);
    expect(estimate?.gstAmount).toBeCloseTo(estimate!.customerTotal * 5 / 105);
  });

  it('converts minutes to hours before calculating labour cost', () => {
    const inputs: PriceDiscoveryInputs = {
      timeSpent: '120',
      timeUnit: 'minutes',
      materialCost: '100',
      shippingCost: '100',
      packagingCost: '100',
      gstPercent: '5',
      targetMarginPercent: '45',
    };
    const minutesEstimate = estimateProductPrice(inputs, DEFAULT_PRICE_DISCOVERY_DEFAULTS);
    const hoursEstimate = estimateProductPrice({
      ...inputs,
      timeSpent: '2',
      timeUnit: 'hours',
    }, DEFAULT_PRICE_DISCOVERY_DEFAULTS);

    expect(minutesEstimate?.labourCost).toBe(200);
    expect(minutesEstimate?.totalCost).toBe(hoursEstimate?.totalCost);
    expect(minutesEstimate?.suggestedCustomerPrice).toBe(hoursEstimate?.suggestedCustomerPrice);
  });

  it('requires every cost and a verified GST rate', () => {
    expect(estimateProductPrice({
      timeSpent: '1', timeUnit: 'hours', materialCost: '50', shippingCost: '100', packagingCost: '100', gstPercent: '',
      targetMarginPercent: '45',
    }, DEFAULT_PRICE_DISCOVERY_DEFAULTS)).toBeNull();
    expect(estimateProductPrice({
      timeSpent: '-1', timeUnit: 'hours', materialCost: '50', shippingCost: '100', packagingCost: '100', gstPercent: '5',
      targetMarginPercent: '45',
    }, DEFAULT_PRICE_DISCOVERY_DEFAULTS)).toBeNull();
    expect(estimateProductPrice({
      timeSpent: '1', timeUnit: 'hours', materialCost: '50', shippingCost: '100', packagingCost: '100', gstPercent: '101',
      targetMarginPercent: '45',
    }, DEFAULT_PRICE_DISCOVERY_DEFAULTS)).toBeNull();
    expect(estimateProductPrice({
      timeSpent: '1', timeUnit: 'hours', materialCost: '50', shippingCost: '100', packagingCost: '100', gstPercent: '5',
      targetMarginPercent: '100',
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
      targetMarginPercent: '45',
    };
    const outcome = calculatePriceAtSellingPrice(inputs, DEFAULT_PRICE_DISCOVERY_DEFAULTS, '1100');

    expect(outcome).not.toBeNull();
    expect(outcome?.totalCost).toBe(500);
    expect(outcome?.customerTotal).toBe(1100);
    expect(outcome?.gstAmount).toBeCloseTo(1100 * 5 / 105);
    expect(outcome?.profit).toBeCloseTo(521.659);
    expect(outcome?.profitMarginPercent).toBeCloseTo(49.795);
  });

  it('calculates a custom price even when the requested target margin cannot produce a suggestion', () => {
    const inputs: PriceDiscoveryInputs = {
      timeSpent: '1',
      timeUnit: 'hours',
      materialCost: '100',
      shippingCost: '100',
      packagingCost: '10',
      gstPercent: '5',
      targetMarginPercent: '99.9',
    };

    expect(estimateProductPrice(inputs, DEFAULT_PRICE_DISCOVERY_DEFAULTS)).toBeNull();
    expect(
      calculatePriceAtSellingPrice(inputs, DEFAULT_PRICE_DISCOVERY_DEFAULTS, '1000'),
    ).toMatchObject({ customerTotal: 1000, gstAmount: 1000 * 5 / 105 });
  });

  it.each(['', '0', '-1', 'not-a-price'])('rejects invalid custom selling prices (%s)', (price) => {
    expect(calculatePriceAtSellingPrice({
      timeSpent: '1', timeUnit: 'hours', materialCost: '50', shippingCost: '100',
      packagingCost: '100', gstPercent: '5', targetMarginPercent: '45',
    }, DEFAULT_PRICE_DISCOVERY_DEFAULTS, price)).toBeNull();
  });

  it('adjusts the recommended price when the product-specific target margin changes', () => {
    const inputs: PriceDiscoveryInputs = {
      timeSpent: '1',
      timeUnit: 'hours',
      materialCost: '100',
      shippingCost: '100',
      packagingCost: '10',
      gstPercent: '5',
      targetMarginPercent: '35',
    };
    const lowerMargin = estimateProductPrice(inputs, DEFAULT_PRICE_DISCOVERY_DEFAULTS);
    const higherMargin = estimateProductPrice({
      ...inputs,
      targetMarginPercent: '55',
    }, DEFAULT_PRICE_DISCOVERY_DEFAULTS);

    expect(lowerMargin).not.toBeNull();
    expect(higherMargin).not.toBeNull();
    expect(higherMargin!.suggestedCustomerPrice).toBeGreaterThan(lowerMargin!.suggestedCustomerPrice);
  });

  it('rounds up so the selected price does not fall below the calculated suggestion', () => {
    expect(roundPriceUp(974.1, 5)).toBe(975);
    expect(roundPriceUp(1000, 10)).toBe(1000);
  });
});
