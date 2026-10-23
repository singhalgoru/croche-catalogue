// @vitest-environment node
import { expect, it } from 'vitest';
import { orderMarginBasis, type MarginItem } from './margin';
const item: MarginItem = { quantity: 2,line_total_paise: 100000,seller_sales: [{
  quantity: 2,gst_percent: 5,material_cost: 100,labour_cost: 50,packaging_cost: 10,
  gateway_fee_percent: 2,gateway_fee_gst_percent: 18,
}] };
it('includes collected shipping and discounts, using quantity costs and fees on the full paid amount', () => {
  const basis = orderMarginBasis(100000,10000,10000,[item])!;
  expect(basis.revenue).toBe(1000);
  expect(basis.gst).toBeCloseTo(1000 * 5 / 105);
  expect(basis.gatewayFee).toBeCloseTo(23.6);
  expect(basis.productCosts).toBe(320);
});
it('weights mixed tax rates by line value without relying on rounded per-piece sale prices', () => {
  const other = { ...item,quantity: 1,line_total_paise: 50000,seller_sales: [{ ...item.seller_sales[0],quantity: 1,gst_percent: 18 }] };
  const basis = orderMarginBasis(150000,10000,5000,[item,other])!;
  expect(basis.revenue).toBe(1450);
  expect(basis.gst).toBeCloseTo(1450 * (2 / 3 * 5 / 105 + 1 / 3 * 18 / 118));
  expect(basis.productCosts).toBe(480);
});
it('does not invent a zero-cost profit when snapshots are missing, changed or invalid', () => {
  expect(orderMarginBasis(100000,0,0,[{ ...item,seller_sales: [] }])).toBeNull();
  expect(orderMarginBasis(100000,0,0,[{ ...item,quantity: 3 }])).toBeNull();
  expect(orderMarginBasis(100001,0,0,[item])).toBeNull();
  expect(orderMarginBasis(100000,100001,0,[item])).toBeNull();
  expect(orderMarginBasis(100000,0,0,[{ ...item,seller_sales: [{ ...item.seller_sales[0],material_cost: NaN }] }])).toBeNull();
});
it('uses packaging once for the entire parcel instead of product packaging multiplied by quantity', () => {
  const basis = orderMarginBasis(100000,0,0,[item],25)!;
  expect(basis.productCosts).toBe(325);
  expect(orderMarginBasis(100000,0,0,[item],NaN)).toBeNull();
});
