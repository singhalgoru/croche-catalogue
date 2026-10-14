import type { Product } from '../types/product';
import { getPublicVariantPrice } from './productPrice';

export interface CataloguePriceRange {
  minimum: number | null;
  maximum: number | null;
}

export const getCatalogueProductPrice = (product: Product) =>
  getPublicVariantPrice(product, product.variants[0]);

export const matchesCataloguePriceRange = (
  product: Product,
  range: CataloguePriceRange | null,
) => {
  if (!range) return true;
  const price = getCatalogueProductPrice(product);
  return price !== null
    && (range.minimum === null || price >= range.minimum)
    && (range.maximum === null || price <= range.maximum);
};
