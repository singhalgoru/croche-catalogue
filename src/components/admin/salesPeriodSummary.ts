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
  const summary = summarizeSellerSales(sales.filter(sale => inPeriod(sale.saleDate)));
  const overheads = expenses.filter(expense => inPeriod(expense.expenseDate))
    .reduce((total, expense) => total + expense.amount, 0);
  const profitAfterOverheads = summary.profit - overheads;
  return {
    ...summary,
    overheads,
    profitAfterOverheads,
    marginAfterOverheads: summary.taxableRevenue > 0
      ? profitAfterOverheads / summary.taxableRevenue * 100 : null,
  };
}
