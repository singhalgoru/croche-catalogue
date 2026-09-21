import type { Product } from '../types/product';

const NEW_PRODUCT_DURATION_MS = 3 * 24 * 60 * 60 * 1000;

export const isProductNew = (product: Product, now = Date.now()) => {
  if (!product.publishedAt) return false;
  const publishedAt = Date.parse(product.publishedAt);
  const age = now - publishedAt;
  return Number.isFinite(publishedAt) && age >= 0 && age < NEW_PRODUCT_DURATION_MS;
};
