import { describe, expect, it } from 'vitest';
import type { SellerSale } from '../../services/sellerSales';
import type { BusinessExpense } from '../../services/businessExpenses';
import { CALENDAR_QUARTERS, summarizeSalesPeriod } from './salesPeriodSummary';

const sale: SellerSale = {
  id: 'sale', productId: null, productName: 'Rose', variantName: '',
  saleDate: '2026-01-01', channel: 'offline', quantity: 1, unitPrice: 105,
  gstPercent: 5, materialCost: 20, labourCost: 10, packagingCost: 5, shippingCost: 10,
  gatewayFeePercent: 0, gatewayFeeGstPercent: 18, notes: '', createdAt: '2027-01-01T00:00:00Z',
};
const expense: BusinessExpense = {
  id: 'expense', description: 'Ads', expenseDate: '2026-01-01', category: 'Advertising', amount: 10, notes: '',
};

describe('period sales snapshots', () => {
  it('assigns calendar boundaries exactly once using sale and expense dates', () => {
    const dates = ['2026-01-01', '2026-03-31', '2026-04-01', '2026-06-30',
      '2026-07-01', '2026-09-30', '2026-10-01', '2026-12-31', '2025-12-31', '2027-01-01'];
    const sales = dates.map((saleDate, index) => ({ ...sale, saleDate, id: String(index) }));
    const expenses = dates.map((expenseDate, index) => ({ ...expense, expenseDate, id: String(index) }));
    const annual = summarizeSalesPeriod(sales, expenses, '2026');
    const quarters = CALENDAR_QUARTERS.map(quarter =>
      summarizeSalesPeriod(sales, expenses, '2026', quarter.startMonth, quarter.endMonth));
    expect(annual.salesCount).toBe(8);
    expect(annual.overheads).toBe(80);
    for (const quarter of quarters) {
      expect(quarter.salesCount).toBe(2);
      expect(quarter.profitAfterOverheads).toBe(90);
      expect(quarter.marginAfterOverheads).toBe(45);
    }
    for (const metric of ['revenue', 'profit', 'overheads', 'profitAfterOverheads', 'gst', 'piecesSold',
      'materialCost', 'labourCost', 'packagingCost', 'shippingCost'] as const) {
      expect(quarters.reduce((sum, quarter) => sum + quarter[metric], 0)).toBeCloseTo(annual[metric]);
    }
  });

  it('multiplies material and labour per piece but counts shipping once per sale', () => {
    const sales = [
      { ...sale, quantity: 3, materialCost: 20, labourCost: 10, shippingCost: 75 },
      { ...sale, saleDate: '2026-04-01', quantity: 2, materialCost: 15, labourCost: 12, shippingCost: 50 },
      { ...sale, saleDate: '2025-01-01', quantity: 100 },
    ];
    expect(summarizeSalesPeriod(sales, [], '2026')).toMatchObject({
      materialCost: 90, labourCost: 54, packagingCost: 25, shippingCost: 125,
    });
    expect(summarizeSalesPeriod(sales, [], '2026', 1, 3)).toMatchObject({
      materialCost: 60, labourCost: 30, packagingCost: 15, shippingCost: 75,
    });
    expect(summarizeSalesPeriod(sales, [], '2026', 7, 9)).toMatchObject({
      materialCost: 0, labourCost: 0, packagingCost: 0, shippingCost: 0,
    });
  });

  it('weights margins by aggregate revenue, not sale count', () => {
    const totals = summarizeSalesPeriod([
      { ...sale, materialCost: 0, labourCost: 0, packagingCost: 0, shippingCost: 0 },
      { ...sale, quantity: 9, materialCost: 50, labourCost: 0, packagingCost: 0, shippingCost: 0 },
    ], [expense], '2026');
    expect(totals.taxableRevenue).toBe(1000);
    expect(totals.profitAfterOverheads).toBe(540);
    expect(totals.marginAfterOverheads).toBe(54);
  });

  it('handles empty and expense-only periods without fictitious margins', () => {
    expect(summarizeSalesPeriod([], [], '2026')).toMatchObject({
      revenue: 0, profitAfterOverheads: 0, marginAfterOverheads: null,
    });
    expect(summarizeSalesPeriod([], [expense], '2026')).toMatchObject({
      overheads: 10, profitAfterOverheads: -10, marginAfterOverheads: null,
    });
  });
});
