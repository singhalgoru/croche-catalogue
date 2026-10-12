import type { BusinessExpense } from '../../services/businessExpenses';
import type { SellerSale } from '../../services/sellerSales';
import { summarizeSellerSales } from './sellerSalesSummary';

export const CALENDAR_QUARTERS = [
  { label: 'Q1 · Jan–Mar', startMonth: 1, endMonth: 3 },
  { label: 'Q2 · Apr–Jun', startMonth: 4, endMonth: 6 },
  { label: 'Q3 · Jul–Sep', startMonth: 7, endMonth: 9 },
  { label: 'Q4 · Oct–Dec', startMonth: 10, endMonth: 12 },
] as const;

export function summarizeSalesPeriod(
  sales: SellerSale[],
  expenses: BusinessExpense[],
  year: string,
  startMonth = 1,
  endMonth = 12,
) {
  const inPeriod = (date: string) => {
    const month = Number(date.slice(5, 7));
    return date.startsWith(`${year}-`) && month >= startMonth && month <= endMonth;
  };
  const periodSales = sales.filter(sale => inPeriod(sale.saleDate));
  const summary = summarizeSellerSales(periodSales);
  const saleCosts = periodSales.reduce((totals, sale) => ({
    materialCost: totals.materialCost + sale.materialCost * sale.quantity,
    labourCost: totals.labourCost + sale.labourCost * sale.quantity,
    packagingCost: totals.packagingCost + sale.packagingCost * sale.quantity,
    shippingCost: totals.shippingCost + sale.shippingCost,
  }), { materialCost: 0, labourCost: 0, packagingCost: 0, shippingCost: 0 });
  const overheads = expenses.filter(expense => inPeriod(expense.expenseDate))
    .reduce((total, expense) => total + expense.amount, 0);
  const profitAfterOverheads = summary.profit - overheads;
  return {
    ...summary,
    ...saleCosts,
    overheads,
    profitAfterOverheads,
    marginAfterOverheads: summary.taxableRevenue > 0
      ? profitAfterOverheads / summary.taxableRevenue * 100 : null,
  };
}
