export interface PriceDiscoveryDefaults {
  labourRate: number;
  markupPercent: number;
  gatewayFeePercent: number;
  gatewayFeeGstPercent: number;
}

export interface PriceDiscoveryInputs {
  timeSpent: string;
  timeUnit: 'hours' | 'minutes';
  materialCost: string;
  shippingCost: string;
  packagingCost: string;
  gstPercent: string;
}

export interface PriceDiscoveryEstimate {
  labourCost: number;
  totalCost: number;
  targetBeforeGatewayFee: number;
  suggestedCustomerPrice: number;
  gstAmount: number;
  customerTotal: number;
  gatewayFee: number;
  expectedNet: number;
}

export interface PriceAtSellingPrice extends PriceDiscoveryEstimate {
  profit: number;
  profitMarginPercent: number | null;
}

export const DEFAULT_PRICE_DISCOVERY_DEFAULTS: PriceDiscoveryDefaults = {
  labourRate: 100,
  markupPercent: 90,
  gatewayFeePercent: 2,
  gatewayFeeGstPercent: 18,
};

const parseNonNegative = (value: string): number | null => {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

export const estimateProductPrice = (
  inputs: PriceDiscoveryInputs,
  defaults: PriceDiscoveryDefaults,
): PriceDiscoveryEstimate | null => {
  const timeSpent = parseNonNegative(inputs.timeSpent);
  const materialCost = parseNonNegative(inputs.materialCost);
  const shippingCost = parseNonNegative(inputs.shippingCost);
  const packagingCost = parseNonNegative(inputs.packagingCost);
  const gstPercent = parseNonNegative(inputs.gstPercent);
  if (
    timeSpent === null || materialCost === null || shippingCost === null
    || packagingCost === null || gstPercent === null || gstPercent > 100
  ) return null;

  const hours = inputs.timeUnit === 'minutes' ? timeSpent / 60 : timeSpent;
  const labourCost = hours * defaults.labourRate;
  const totalCost = labourCost + materialCost + shippingCost + packagingCost;
  const targetBeforeGatewayFee = totalCost * (1 + defaults.markupPercent / 100);
  const gatewayFeeRate =
    (defaults.gatewayFeePercent / 100) * (1 + defaults.gatewayFeeGstPercent / 100);
  const denominator = 1 / (1 + gstPercent / 100) - gatewayFeeRate;
  if (!Number.isFinite(denominator) || denominator <= 0) return null;

  const customerTotal = targetBeforeGatewayFee / denominator;
  const gatewayFee = customerTotal * gatewayFeeRate;
  const gstAmount = customerTotal * gstPercent / (100 + gstPercent);

  return {
    labourCost,
    totalCost,
    targetBeforeGatewayFee,
    suggestedCustomerPrice: customerTotal,
    gstAmount,
    customerTotal,
    gatewayFee,
    expectedNet: customerTotal - gstAmount - gatewayFee,
  };
};

export const calculatePriceAtSellingPrice = (
  inputs: PriceDiscoveryInputs,
  defaults: PriceDiscoveryDefaults,
  sellingPriceIncludingGst: string,
): PriceAtSellingPrice | null => {
  const price = parseNonNegative(sellingPriceIncludingGst);
  const estimate = estimateProductPrice(inputs, defaults);
  if (price === null || price <= 0 || !estimate) return null;

  const gstPercent = Number(inputs.gstPercent);
  const gatewayFeeRate =
    (defaults.gatewayFeePercent / 100) * (1 + defaults.gatewayFeeGstPercent / 100);
  const gstAmount = price * gstPercent / (100 + gstPercent);
  const saleValueExcludingGst = price - gstAmount;
  const customerTotal = price;
  const gatewayFee = customerTotal * gatewayFeeRate;
  const expectedNet = customerTotal - gstAmount - gatewayFee;
  const profit = expectedNet - estimate.totalCost;

  return {
    ...estimate,
    suggestedCustomerPrice: price,
    gstAmount,
    customerTotal,
    gatewayFee,
    expectedNet,
    profit,
    profitMarginPercent: profit / saleValueExcludingGst * 100,
  };
};

export const roundPriceUp = (price: number, increment: number) =>
  Math.ceil(price / increment) * increment;
