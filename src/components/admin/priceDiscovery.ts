export interface PriceDiscoveryDefaults {
  labourRate: number;
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
  targetMarginPercent: string;
}

export interface PriceDiscoveryEstimate {
  labourCost: number;
  materialCost: number;
  shippingCost: number;
  packagingCost: number;
  totalCost: number;
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
  gatewayFeePercent: 2,
  gatewayFeeGstPercent: 18,
};

export const DEFAULT_TARGET_MARGIN_PERCENT = 45;

export const createDefaultPriceInputs = (product: {
  priceDiscoveryInputs?: PriceDiscoveryInputs | null;
  gstPercent?: number | null;
  profitMarginPercent?: number | null;
} = {}): PriceDiscoveryInputs => product.priceDiscoveryInputs ?? {
  timeSpent: '',
  timeUnit: 'hours',
  materialCost: '',
  shippingCost: '100',
  packagingCost: '10',
  gstPercent: String(product.gstPercent ?? 5),
  targetMarginPercent: String(product.profitMarginPercent ?? DEFAULT_TARGET_MARGIN_PERCENT),
};

const parseNonNegative = (value: string): number | null => {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const calculateCostBasis = (
  inputs: PriceDiscoveryInputs,
  defaults: PriceDiscoveryDefaults,
) => {
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
  return {
    labourCost,
    materialCost,
    shippingCost,
    packagingCost,
    totalCost: labourCost + materialCost + shippingCost + packagingCost,
    gstPercent,
  };
};

export const estimateProductPrice = (
  inputs: PriceDiscoveryInputs,
  defaults: PriceDiscoveryDefaults,
): PriceDiscoveryEstimate | null => {
  const costBasis = calculateCostBasis(inputs, defaults);
  const targetMarginPercent = parseNonNegative(inputs.targetMarginPercent);
  if (!costBasis || targetMarginPercent === null || targetMarginPercent >= 100) return null;

  const gatewayFeeRate =
    (defaults.gatewayFeePercent / 100) * (1 + defaults.gatewayFeeGstPercent / 100);
  const gstRate = costBasis.gstPercent / 100;
  const denominator = 1 - gatewayFeeRate * (1 + gstRate) - targetMarginPercent / 100;
  if (!Number.isFinite(denominator) || denominator <= 0) return null;

  const saleValueExcludingGst = costBasis.totalCost / denominator;
  const customerTotal = saleValueExcludingGst * (1 + gstRate);
  const gatewayFee = customerTotal * gatewayFeeRate;
  const gstAmount = customerTotal * costBasis.gstPercent / (100 + costBasis.gstPercent);

  return {
    labourCost: costBasis.labourCost,
    materialCost: costBasis.materialCost,
    shippingCost: costBasis.shippingCost,
    packagingCost: costBasis.packagingCost,
    totalCost: costBasis.totalCost,
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
  const costBasis = calculateCostBasis(inputs, defaults);
  if (price === null || price <= 0 || !costBasis) return null;

  const gatewayFeeRate =
    (defaults.gatewayFeePercent / 100) * (1 + defaults.gatewayFeeGstPercent / 100);
  const gstAmount = price * costBasis.gstPercent / (100 + costBasis.gstPercent);
  const saleValueExcludingGst = price - gstAmount;
  const customerTotal = price;
  const gatewayFee = customerTotal * gatewayFeeRate;
  const expectedNet = customerTotal - gstAmount - gatewayFee;
  const profit = expectedNet - costBasis.totalCost;

  return {
    ...costBasis,
    suggestedCustomerPrice: price,
    gstAmount,
    customerTotal,
    gatewayFee,
    expectedNet,
    profit,
    profitMarginPercent: profit / saleValueExcludingGst * 100,
  };
};

export const calculateMinimumOrderQuantity = (
  inputs: PriceDiscoveryInputs,
  defaults: PriceDiscoveryDefaults,
  sellingPriceIncludingGst: string,
): number | null => {
  const price = parseNonNegative(sellingPriceIncludingGst);
  const costBasis = calculateCostBasis(inputs, defaults);
  const targetMarginPercent = parseNonNegative(inputs.targetMarginPercent);
  if (
    price === null || price <= 0 || !costBasis || targetMarginPercent === null
    || targetMarginPercent >= 100
  ) return null;

  const gatewayFeeRate =
    (defaults.gatewayFeePercent / 100) * (1 + defaults.gatewayFeeGstPercent / 100);
  const revenueAfterGst = price / (1 + costBasis.gstPercent / 100);
  const contributionPerPiece =
    revenueAfterGst * (1 - targetMarginPercent / 100)
    - price * gatewayFeeRate
    - costBasis.labourCost
    - costBasis.materialCost
    - costBasis.packagingCost;
  if (contributionPerPiece <= 0) return null;
  return Math.max(1, Math.ceil(costBasis.shippingCost / contributionPerPiece));
};

export const roundPriceUp = (price: number, increment: number) =>
  Math.ceil(price / increment) * increment;
