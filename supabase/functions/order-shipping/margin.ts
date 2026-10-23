interface CostSnapshot {
  quantity: number;
  gst_percent: number;
  material_cost: number;
  labour_cost: number;
  packaging_cost: number;
  gateway_fee_percent: number;
  gateway_fee_gst_percent: number;
}
export interface MarginItem {
  quantity: number;
  line_total_paise: number;
  seller_sales: CostSnapshot[];
}

export function orderMarginBasis(subtotalPaise: number, discountPaise: number, shippingPaise: number, items: MarginItem[]) {
  if (!items.length || subtotalPaise <= 0 || discountPaise < 0 || discountPaise > subtotalPaise
    || shippingPaise < 0 || ![subtotalPaise, discountPaise, shippingPaise].every(Number.isFinite)
    || items.reduce((sum, item) => sum + Number(item.line_total_paise), 0) !== subtotalPaise) return null;
  const revenue = (subtotalPaise - discountPaise + shippingPaise) / 100;
  let gst = 0;
  let gatewayFee = 0;
  let productCosts = 0;
  for (const item of items) {
    if (item.seller_sales.length !== 1) return null;
    const sale = item.seller_sales[0];
    const fields = [sale.gst_percent, sale.material_cost, sale.labour_cost, sale.packaging_cost,
      sale.gateway_fee_percent, sale.gateway_fee_gst_percent];
    if (!fields.every(value => value !== null && Number.isFinite(Number(value)) && Number(value) >= 0)
      || !Number.isInteger(item.quantity) || item.quantity <= 0 || sale.quantity !== item.quantity
      || !Number.isFinite(item.line_total_paise) || item.line_total_paise < 0
      || [sale.gst_percent, sale.gateway_fee_percent, sale.gateway_fee_gst_percent].some(value => Number(value) > 100)) return null;
    // Allocate discounts and collected shipping by line value, without per-piece ledger rounding.
    const lineRevenue = revenue * item.line_total_paise / subtotalPaise;
    gst += lineRevenue * Number(sale.gst_percent) / (100 + Number(sale.gst_percent));
    gatewayFee += lineRevenue * Number(sale.gateway_fee_percent) / 100 * (1 + Number(sale.gateway_fee_gst_percent) / 100);
    productCosts += item.quantity * (Number(sale.material_cost) + Number(sale.labour_cost) + Number(sale.packaging_cost));
  }
  return { revenue, gst, gatewayFee, productCosts };
}
