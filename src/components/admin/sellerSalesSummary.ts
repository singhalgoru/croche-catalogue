import type { SellerSale } from '../../services/sellerSales';

export interface SaleFinancials {
  revenue: number;
  gst: number;
  gatewayFee: number;
  costs: number;
  profit: number;
  taxableRevenue: number;
  marginPercent: number | null;
  marketingAllocation: number;
  returnsAllocation: number;
  overheadAllocation: number;
  allocations: number;
  profitAfterAllocations: number;
  marginAfterAllocations: number | null;
}

export const calculateSaleFinancials = (sale: SellerSale): SaleFinancials => {
  const itemRevenue = sale.unitPrice * sale.quantity;
  const share = sale.order && sale.order.itemRevenue > 0 ? itemRevenue / sale.order.itemRevenue : 0;
  const revenue = itemRevenue + (sale.order?.shippingCollected ?? 0) * share;
  const gst = revenue * sale.gstPercent / (100 + sale.gstPercent);
  const taxableRevenue = revenue - gst;
  const gatewayFee =
    revenue * sale.gatewayFeePercent / 100 * (1 + sale.gatewayFeeGstPercent / 100);
  const costs = sale.quantity
    * (sale.materialCost + sale.labourCost + (sale.order ? 0 : sale.packagingCost))
    + (sale.order ? (sale.order.packagingCost + sale.order.shippingCost) * share : sale.shippingCost);
  const profit = taxableRevenue - gatewayFee - costs;
  const marketingAllocation = taxableRevenue * (sale.marketingPercent ?? 0) / 100;
  const returnsAllocation = taxableRevenue * (sale.returnsReservePercent ?? 0) / 100;
  const overheadAllocation = taxableRevenue * (sale.overheadPercent ?? 0) / 100;
  const allocations = marketingAllocation + returnsAllocation + overheadAllocation;
  const profitAfterAllocations = profit - allocations;
  return {
    revenue,
    gst,
    gatewayFee,
    costs,
    profit,
    taxableRevenue,
    marginPercent: taxableRevenue > 0 ? profit / taxableRevenue * 100 : null,
    marketingAllocation,
    returnsAllocation,
    overheadAllocation,
    allocations,
    profitAfterAllocations,
    marginAfterAllocations: taxableRevenue > 0 ? profitAfterAllocations / taxableRevenue * 100 : null,
  };
};

export const summarizeSellerSales = (sales: SellerSale[]) => {
  const financials = sales.map(calculateSaleFinancials);
  const revenue = financials.reduce((sum, sale) => sum + sale.revenue, 0);
  const gst = financials.reduce((sum, sale) => sum + sale.gst, 0);
  const gatewayFee = financials.reduce((sum, sale) => sum + sale.gatewayFee, 0);
  const costs = financials.reduce((sum, sale) => sum + sale.costs, 0);
  const taxableRevenue = financials.reduce((sum, sale) => sum + sale.taxableRevenue, 0);
  const profit = financials.reduce((sum, sale) => sum + sale.profit, 0);
  const marketingAllocation = financials.reduce((sum, sale) => sum + sale.marketingAllocation, 0);
  const returnsAllocation = financials.reduce((sum, sale) => sum + sale.returnsAllocation, 0);
  const overheadAllocation = financials.reduce((sum, sale) => sum + sale.overheadAllocation, 0);
  const allocations = marketingAllocation + returnsAllocation + overheadAllocation;
  const profitAfterAllocations = profit - allocations;
  return {
    salesCount: new Set(sales.map(sale => sale.order?.id ?? sale.id)).size,
    piecesSold: sales.reduce((sum, sale) => sum + sale.quantity, 0),
    revenue,
    gst,
    gatewayFee,
    costs,
    profit,
    taxableRevenue,
    marginPercent: taxableRevenue > 0 ? profit / taxableRevenue * 100 : null,
    marketingAllocation,
    returnsAllocation,
    overheadAllocation,
    allocations,
    profitAfterAllocations,
    marginAfterAllocations: taxableRevenue > 0 ? profitAfterAllocations / taxableRevenue * 100 : null,
  };
};
