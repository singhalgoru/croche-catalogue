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
  return {
    margin: product.profitMarginPercent !== null
      && product.profitMarginPercent !== undefined
      && Number.isFinite(product.profitMarginPercent)
      && product.profitMarginPercent < GOOD_MARGIN_PERCENT,
    costs: suggestGoodMarginPrice(createDefaultPriceInputs(product), defaults) === null,
    stock: !product.inStock || outOfStock.length > 0 || lowStock.length > 0,
    lowStockCount: lowStock.length,
    outOfStockCount: outOfStock.length,
  };
}
