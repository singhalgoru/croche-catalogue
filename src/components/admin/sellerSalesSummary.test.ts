import { describe, expect, it } from 'vitest';
import type { SellerSale } from '../../services/sellerSales';
import { calculateSaleFinancials, summarizeSellerSales } from './sellerSalesSummary';

const sale: SellerSale = {
  id: 'sale-1',
  productId: 'product-1',
  productName: 'Crochet flower',
  variantName: '',
  saleDate: '2026-10-06',
  channel: 'online',
  quantity: 2,
  unitPrice: 105,
  gstPercent: 5,
  materialCost: 20,
  labourCost: 10,
  packagingCost: 5,
  shippingCost: 30,
  gatewayFeePercent: 2,
  gatewayFeeGstPercent: 18,
  notes: '',
  createdAt: '2026-10-06T10:00:00Z',
};

describe('seller sales profit calculations', () => {
  it('extracts GST from the GST-inclusive revenue and subtracts transaction fees and costs', () => {
    const totals = calculateSaleFinancials(sale);
    expect(totals.revenue).toBe(210);
    expect(totals.gst).toBe(10);
    expect(totals.taxableRevenue).toBe(200);
    expect(totals.gatewayFee).toBeCloseTo(4.956);
    expect(totals.costs).toBe(100);
    expect(totals.profit).toBeCloseTo(95.044);
    expect(totals.marginPercent).toBeCloseTo(47.522);
  });

  it('computes overall monthly margin from aggregate taxable revenue', () => {
    const totals = summarizeSellerSales([sale, { ...sale, id: 'sale-2', quantity: 1 }]);
    expect(totals).toMatchObject({
      salesCount: 2,
      piecesSold: 3,
      revenue: 315,
      gst: 15,
      taxableRevenue: 300,
      costs: 165,
    });
    expect(totals.profit).toBeCloseTo(127.566);
    expect(totals.marginPercent).toBeCloseTo(42.522);
  });
});
