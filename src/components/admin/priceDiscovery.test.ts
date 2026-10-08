import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRICE_DISCOVERY_DEFAULTS,
  calculatePriceAtSellingPrice,
  calculateMinimumOrderQuantity,
  estimateProductPrice,
  roundPriceUp,
  suggestGoodMarginPrice,
  type PriceDiscoveryInputs,
} from './priceDiscovery';

describe('price discovery calculations', () => {
  it.each([0, 5, 18])('suggests a whole-rupee price achieving at least 35 percent at %s GST', gstPercent => {
    const inputs: PriceDiscoveryInputs = {
      timeSpent: '1', timeUnit: 'hours', materialCost: '50',
      shippingCost: '100', packagingCost: '10',
      gstPercent: String(gstPercent), targetMarginPercent: '60',
    };
    const price = suggestGoodMarginPrice(inputs, DEFAULT_PRICE_DISCOVERY_DEFAULTS)!;
    expect(Number.isInteger(price)).toBe(true);
    expect(calculatePriceAtSellingPrice(inputs, DEFAULT_PRICE_DISCOVERY_DEFAULTS, String(price))!.profitMarginPercent)
      .toBeGreaterThanOrEqual(35);
    expect(calculatePriceAtSellingPrice(inputs, DEFAULT_PRICE_DISCOVERY_DEFAULTS, String(price - 1))!.profitMarginPercent)
      .toBeLessThan(35);
    expect(inputs.targetMarginPercent).toBe('60');
    expect(suggestGoodMarginPrice({ ...inputs, materialCost: '' }, DEFAULT_PRICE_DISCOVERY_DEFAULTS)).toBeNull();
  });

  it('does not suggest a free price when all costs are zero', () => {
    expect(suggestGoodMarginPrice({
      timeSpent: '0', timeUnit: 'hours', materialCost: '0',
      shippingCost: '0', packagingCost: '0', gstPercent: '5', targetMarginPercent: '45',
    }, DEFAULT_PRICE_DISCOVERY_DEFAULTS)).toBe(1);
  });

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

  it('suggests the smallest order quantity that covers fixed shipping while meeting margin', () => {
    const inputs: PriceDiscoveryInputs = {
      timeSpent: '0.1',
      timeUnit: 'hours',
      materialCost: '20',
      shippingCost: '100',
      packagingCost: '10',
      gstPercent: '5',
      targetMarginPercent: '45',
    };
    const quantity = calculateMinimumOrderQuantity(
      inputs,
      DEFAULT_PRICE_DISCOVERY_DEFAULTS,
      '200',
    );

    expect(quantity).toBe(2);
    const requiredQuantity = quantity ?? 0;
    const marginContributionPerPiece =
      200 / 1.05 * 0.55 - 200 * 0.0236 - 10 - 20 - 10;
    expect((requiredQuantity - 1) * marginContributionPerPiece).toBeLessThan(100);
    expect(requiredQuantity * marginContributionPerPiece).toBeGreaterThanOrEqual(100);
  });

  it('returns no quantity when a positive per-piece contribution is impossible', () => {
    expect(calculateMinimumOrderQuantity({
      timeSpent: '1',
      timeUnit: 'hours',
      materialCost: '200',
      shippingCost: '100',
      packagingCost: '20',
      gstPercent: '5',
      targetMarginPercent: '45',
    }, DEFAULT_PRICE_DISCOVERY_DEFAULTS, '80')).toBeNull();
  });

  it('rounds up so the selected price does not fall below the calculated suggestion', () => {
    expect(roundPriceUp(974.1, 5)).toBe(975);
    expect(roundPriceUp(1000, 10)).toBe(1000);
  });
});
