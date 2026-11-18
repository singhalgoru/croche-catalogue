import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRICE_DISCOVERY_DEFAULTS,
  createDefaultPriceInputs,
  calculatePriceAtSellingPrice,
  calculateLabourCost,
  calculateMinimumOrderQuantity,
  estimateProductPrice,
  roundPriceUp,
  suggestGoodMarginPrice,
  type PriceDiscoveryInputs,
} from './priceDiscovery';

describe('price discovery calculations', () => {
  it('uses the default or product rate for labour, suggested prices, margins and minimum quantities', () => {
    const inputs = { ...createDefaultPriceInputs(), timeSpent: '90', timeUnit: 'minutes' as const,
      materialCost: '50', targetMarginPercent: '35' };
    expect(calculateLabourCost(inputs)).toBe(150);
    expect(calculateLabourCost({ ...inputs, labourRate: '200' })).toBe(300);
    expect(calculateLabourCost({ ...inputs, labourRate: '0' })).toBe(0);
    expect(calculateLabourCost({ ...inputs, labourRate: ' ' }, 80)).toBe(120);
    const override = { ...inputs, labourRate: '200' };
    const defaults = DEFAULT_PRICE_DISCOVERY_DEFAULTS;
    expect(estimateProductPrice(override, defaults)?.labourCost).toBe(300);
    expect(estimateProductPrice(override, defaults)!.customerTotal).toBeGreaterThan(estimateProductPrice(inputs, defaults)!.customerTotal);
    expect(calculatePriceAtSellingPrice(override, defaults, '1000')?.profit).toBeCloseTo(
      calculatePriceAtSellingPrice(inputs, defaults, '1000')!.profit - 150);
    expect(calculateMinimumOrderQuantity(override, defaults, '700')).toBeNull();
    expect(calculateMinimumOrderQuantity(inputs, defaults, '700')).not.toBeNull();
    for (const labourRate of ['-1', 'Infinity', 'NaN', '10000.01']) {
      expect(calculateLabourCost({ ...inputs, labourRate })).toBeNull();
      expect(estimateProductPrice({ ...inputs, labourRate }, defaults)).toBeNull();
    }
  });
  it('uses the configurable default GST while preserving saved rates and calculator inputs', () => {
    const defaults = { ...DEFAULT_PRICE_DISCOVERY_DEFAULTS, gstPercent: 12 };
    expect(createDefaultPriceInputs().gstPercent).toBe('5');
    expect(createDefaultPriceInputs({}, defaults).gstPercent).toBe('12');
    expect(createDefaultPriceInputs({ gstPercent: 0 }, defaults).gstPercent).toBe('0');
    expect(createDefaultPriceInputs({ gstPercent: 18 }, defaults).gstPercent).toBe('18');
    const saved = { ...createDefaultPriceInputs(), gstPercent: '3' };
    expect(createDefaultPriceInputs({ priceDiscoveryInputs: saved }, defaults)).toBe(saved);
  });
  it.each([0, 5, 18])('suggests a whole-rupee price achieving at least 20 percent at %s GST', gstPercent => {
    const inputs: PriceDiscoveryInputs = {
      timeSpent: '1', timeUnit: 'hours', materialCost: '50',
      shippingCost: '100', packagingCost: '10',
      gstPercent: String(gstPercent), targetMarginPercent: '60',
    };
    const price = suggestGoodMarginPrice(inputs, DEFAULT_PRICE_DISCOVERY_DEFAULTS)!;
    expect(Number.isInteger(price)).toBe(true);
    expect(calculatePriceAtSellingPrice(inputs, DEFAULT_PRICE_DISCOVERY_DEFAULTS, String(price))!.profitMarginPercent)
      .toBeGreaterThanOrEqual(20);
    expect(calculatePriceAtSellingPrice(inputs, DEFAULT_PRICE_DISCOVERY_DEFAULTS, String(price - 1))!.profitMarginPercent)
      .toBeLessThan(20);
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
    expect(estimate?.baseCost).toBe(500);
    expect(estimate?.marketingAllowance).toBeCloseTo((estimate!.customerTotal - estimate!.gstAmount) * 0.15);
    expect(estimate?.totalCost).toBeCloseTo(500 + (estimate!.customerTotal - estimate!.gstAmount) * 0.24);
    expect(estimate?.expectedNet).toBeGreaterThan(estimate!.totalCost);
    expect(Number.isInteger(estimate!.customerTotal)).toBe(true);
    expect(
      (estimate!.expectedNet - estimate!.totalCost)
      / (estimate!.customerTotal - estimate!.gstAmount) * 100,
    ).toBeGreaterThanOrEqual(45);
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

  it('rounds labour and other costs to whole rupees', () => {
    const estimate = estimateProductPrice({
      timeSpent: '25', timeUnit: 'minutes', materialCost: '20.6',
      shippingCost: '99.5', packagingCost: '9.4', gstPercent: '5', targetMarginPercent: '45',
    }, DEFAULT_PRICE_DISCOVERY_DEFAULTS)!;
    expect(estimate.labourCost).toBe(42);
    expect([estimate.materialCost, estimate.shippingCost, estimate.packagingCost]).toEqual([21, 100, 9]);
    expect(estimate.baseCost).toBe(172);
    expect(estimate.totalCost).toBeGreaterThan(estimate.baseCost);
    expect(Number.isInteger(estimate.suggestedCustomerPrice)).toBe(true);
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
    expect(outcome?.totalCost).toBeCloseTo(751.428571);
    expect(outcome?.customerTotal).toBe(1100);
    expect(outcome?.gstAmount).toBeCloseTo(1100 * 5 / 105);
    expect(outcome?.profit).toBeCloseTo(263.740476);
    expect(outcome?.profitMarginPercent).toBeCloseTo(25.175227);
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

    expect(quantity).toBe(8);
    const requiredQuantity = quantity ?? 0;
    const marginContributionPerPiece =
      200 / 1.05 * (1 - 0.45 - 0.24) - 200 * 0.0295 - 10 - 20 - 10;
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

  it('uses net-sales reserves and the target margin denominator, including the supplied 280-rupee example', () => {
    const inputs: PriceDiscoveryInputs = {
      timeSpent: '1', timeUnit: 'hours', materialCost: '100', shippingCost: '50',
      packagingCost: '30', gstPercent: '0', targetMarginPercent: '20',
    };
    const defaults = { ...DEFAULT_PRICE_DISCOVERY_DEFAULTS, gatewayFeeGstPercent: 0 };
    expect(estimateProductPrice(inputs, defaults)).toMatchObject({
      baseCost: 280, suggestedCustomerPrice: 524,
    });
    expect(calculatePriceAtSellingPrice(inputs, defaults, '525')).toMatchObject({
      marketingAllowance: 78.75, returnsReserve: 21, overheadAllowance: 26.25,
      gatewayFee: 13.125, profit: 105.875,
    });
    const taxed = calculatePriceAtSellingPrice({ ...inputs, gstPercent: '5' }, defaults, '525')!;
    expect(taxed.gstAmount).toBe(25);
    expect(taxed.marketingAllowance).toBe(75);
    expect(taxed.profit).toBeCloseTo(86.875);
    expect(calculatePriceAtSellingPrice(inputs, {
      ...defaults, marketingPercent: 0, returnsReservePercent: 0, overheadPercent: 0,
    }, '525')).toMatchObject({ marketingAllowance: 0, returnsReserve: 0, overheadAllowance: 0, totalCost: 280 });
    for (const marketingPercent of [-1, 101, NaN, Infinity]) {
      expect(estimateProductPrice(inputs, { ...defaults, marketingPercent })).toBeNull();
    }
    expect(estimateProductPrice(inputs, { ...defaults, marketingPercent: 90 })).toBeNull();
  });

  it('applies reserves per net sale while keeping shipping as one fixed order cost', () => {
    const inputs: PriceDiscoveryInputs = {
      timeSpent: '0.1', timeUnit: 'hours', materialCost: '20', shippingCost: '100',
      packagingCost: '10', gstPercent: '0', targetMarginPercent: '20',
    };
    expect(calculateMinimumOrderQuantity(inputs, DEFAULT_PRICE_DISCOVERY_DEFAULTS, '150')).toBe(3);
    for (const quantity of [2, 3]) {
      const revenue = quantity * 150;
      const profit = revenue * (1 - 0.24 - 0.0295) - quantity * 40 - 100;
      expect(profit / revenue >= 0.20).toBe(quantity === 3);
    }
  });
});
