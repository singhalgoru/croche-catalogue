import type { SellerSale } from '../../services/sellerSales';

export interface SaleFinancials {
  revenue: number;
  gst: number;
  gatewayFee: number;
  costs: number;
  profit: number;
  taxableRevenue: number;
  marginPercent: number | null;
}

export const calculateSaleFinancials = (sale: SellerSale): SaleFinancials => {
  const revenue = sale.unitPrice * sale.quantity;
  const gst = revenue * sale.gstPercent / (100 + sale.gstPercent);
  const taxableRevenue = revenue - gst;
  const gatewayFee =
    revenue * sale.gatewayFeePercent / 100 * (1 + sale.gatewayFeeGstPercent / 100);
  const costs = sale.quantity
    * (sale.materialCost + sale.labourCost + sale.packagingCost)
    + sale.shippingCost;
  const profit = taxableRevenue - gatewayFee - costs;
  return {
    revenue,
    gst,
    gatewayFee,
    costs,
    profit,
    taxableRevenue,
    marginPercent: taxableRevenue > 0 ? profit / taxableRevenue * 100 : null,
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
  return {
    salesCount: sales.length,
    piecesSold: sales.reduce((sum, sale) => sum + sale.quantity, 0),
    revenue,
    gst,
    gatewayFee,
    costs,
    profit,
    taxableRevenue,
    marginPercent: taxableRevenue > 0 ? profit / taxableRevenue * 100 : null,
  };
};
