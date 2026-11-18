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
  it('calculates independent allocations on revenue excluding GST without changing sale costs or profit', () => {
    const planned = calculateSaleFinancials({
      ...sale, marketingPercent: 15, returnsReservePercent: 4, overheadPercent: 5,
    });
    expect(planned).toMatchObject({
      marketingAllocation: 30, returnsAllocation: 8, overheadAllocation: 10, allocations: 48,
      costs: 100,
    });
    expect(planned.profit).toBeCloseTo(95.044);
    expect(planned.profitAfterAllocations).toBeCloseTo(47.044);
    expect(planned.marginAfterAllocations).toBeCloseTo(23.522);
    const disabled = calculateSaleFinancials({
      ...sale, marketingPercent: 0, returnsReservePercent: 4, overheadPercent: 5,
    });
    expect(disabled.allocations).toBe(18);
    expect(disabled.profitAfterAllocations).toBeCloseTo(planned.profitAfterAllocations + 30);
    expect(calculateSaleFinancials(sale).profitAfterAllocations).toBeCloseTo(planned.profit);
  });

  it('weights different sale allocations and shared-order revenue exactly once', () => {
    const order = { id: 'order', reference: 'LUV-1', paymentOrderId: null, packagingCost: 30,
      shippingCost: 100, shippingCollected: 50, shippingSource: 'manual' as const, itemRevenue: 315 };
    const first = { ...sale, order, marketingPercent: 15, returnsReservePercent: 4, overheadPercent: 5 };
    const second = { ...first, id: 'second', quantity: 1, marketingPercent: 0 };
    const total = summarizeSellerSales([first, second]);
    expect(total.marketingAllocation).toBeCloseTo((210 + 50 * 2 / 3) / 1.05 * 0.15);
    expect(total.returnsAllocation).toBeCloseTo(365 / 1.05 * 0.04);
    expect(total.overheadAllocation).toBeCloseTo(365 / 1.05 * 0.05);
    expect(total.profitAfterAllocations).toBeCloseTo(total.profit - total.allocations);
    expect(total.marginAfterAllocations).toBeCloseTo(total.profitAfterAllocations / (365 / 1.05) * 100);
  });
  it('counts one multi-product order and allocates shared costs and shipping collected exactly once', () => {
    const order = { id: 'order',reference: 'LUV-1',paymentOrderId: 'payment',packagingCost: 30,shippingCost: 100,
      shippingCollected: 50,shippingSource: 'courier' as const,itemRevenue: 315 };
    const first = { ...sale,order,packagingCost: 0,shippingCost: 0 };
    const second = { ...first,id: 'sale-2',quantity: 1 };
    const total = summarizeSellerSales([first,second]);
    expect(total.salesCount).toBe(1);
    expect(total.revenue).toBeCloseTo(365);
    expect(total.costs).toBeCloseTo(90+30+100);
    expect(total.gst).toBeCloseTo(365*5/105);
    expect(total.gatewayFee).toBeCloseTo(365*0.02*1.18);
    expect(total.profit).toBeCloseTo(365/1.05 - 365*0.02*1.18 - 220);
    const manual = summarizeSellerSales([first,second].map(item => ({
      ...item,order: { ...order,shippingSource: 'manual' as const,shippingCost: 200,packagingCost: 10 },
    })));
    expect(manual.profit).toBeCloseTo(total.profit-80);
  });
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
