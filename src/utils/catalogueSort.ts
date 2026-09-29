import type { Product } from '../types/product';
import { isProductNew } from './productStatus';

export interface CatalogueSortOptions {
  now?: number;
  categoryRanks?: Map<string, number>;
}

/**
 * Catalogue display order:
 *
 *   1. Featured products, because that flag is an explicit merchandising
 *      choice and should outrank everything else.
 *   2. Recently published products, so new arrivals get visibility.
 *   3. The manual order set by dragging in the admin catalogue.
 *
 * Products without a sort order (nothing saved a manual position yet) fall
 * back to their category's priority.
 */
export const compareCatalogueProducts = (
  left: Product,
  right: Product,
  { now = Date.now(), categoryRanks }: CatalogueSortOptions = {},
) => {
  const byFeatured = Number(Boolean(right.featured)) - Number(Boolean(left.featured));
  if (byFeatured !== 0) return byFeatured;

  const byNew = Number(isProductNew(right, now)) - Number(isProductNew(left, now));
  if (byNew !== 0) return byNew;

  if (left.sortOrder !== undefined && right.sortOrder !== undefined) {
    return left.sortOrder - right.sortOrder;
  }

  const rankOf = (product: Product) =>
    categoryRanks?.get(product.category) ?? Number.MAX_SAFE_INTEGER;
  return rankOf(left) - rankOf(right);
};

export const sortCatalogueProducts = (
  products: Product[],
  options: CatalogueSortOptions = {},
) => [...products].sort((left, right) => compareCatalogueProducts(left, right, options));
