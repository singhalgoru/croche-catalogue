import type { Product, ProductVariant } from '../types/product';

export const getVariantPrice = (
  product: Product,
  variant?: ProductVariant | null,
): number | null => variant?.price ?? product.price;

export const getPublicVariantPrice = (
  product: Product,
  variant?: ProductVariant | null,
): number | null => product.showPrice ? getVariantPrice(product, variant) : null;

export const getProductDiscount = (product: Product, variant?: ProductVariant | null) => {
  const price = getPublicVariantPrice(product, variant);
  const regular = variant?.price !== null && variant?.price !== undefined
    ? variant.regularPrice : product.regularPrice;
  return price !== null && regular && regular > price && product.discountPercent
    ? { regular, saving: regular - price, percent: product.discountPercent }
    : null;
};
