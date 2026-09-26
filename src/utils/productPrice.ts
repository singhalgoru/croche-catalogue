import type { Product, ProductVariant } from '../types/product';

export const getVariantPrice = (
  product: Product,
  variant?: ProductVariant | null,
): number | null => variant?.price ?? product.price;

export const getPublicVariantPrice = (
  product: Product,
  variant?: ProductVariant | null,
): number | null => product.showPrice ? getVariantPrice(product, variant) : null;
