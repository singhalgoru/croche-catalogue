import type { ManagedProduct } from '../../services/products';
import {
  createDefaultPriceInputs,
  GOOD_MARGIN_PERCENT,
  suggestGoodMarginPrice,
  type PriceDiscoveryDefaults,
} from './priceDiscovery';

export const LOW_STOCK_QUANTITY = 3;
export const ATTENTION_FILTERS = [
  { id: 'margin', label: `Below ${GOOD_MARGIN_PERCENT}% margin` },
  { id: 'negativeMargin', label: 'Negative margin' },
  { id: 'costs', label: 'Missing pricing costs' },
  { id: 'stock', label: 'Low / out of stock' },
] as const;
export type AttentionFilter = typeof ATTENTION_FILTERS[number]['id'];

export function getProductAttention(
  product: Pick<ManagedProduct, 'profitMarginPercent' | 'gstPercent' | 'priceDiscoveryInputs' | 'inStock' | 'variants'>,
  defaults: PriceDiscoveryDefaults,
) {
  const outOfStock = product.variants.filter(variant =>
    !variant.inStock || variant.availableQuantity <= 0);
  const lowStock = product.variants.filter(variant =>
    variant.inStock && variant.availableQuantity > 0 && variant.availableQuantity < LOW_STOCK_QUANTITY);
  const margin = product.profitMarginPercent;
  const hasMargin = typeof margin === 'number' && Number.isFinite(margin);
  return {
    margin: hasMargin && margin < GOOD_MARGIN_PERCENT,
    negativeMargin: hasMargin && margin < 0,
    costs: suggestGoodMarginPrice(createDefaultPriceInputs(product), defaults) === null,
    stock: !product.inStock || outOfStock.length > 0 || lowStock.length > 0,
    lowStockCount: lowStock.length,
    outOfStockCount: outOfStock.length,
  };
}
