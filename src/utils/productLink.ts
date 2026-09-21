import type { Product } from '../types/product';

const PRODUCT_HASH_PREFIX = '#product=';

export const toProductSlug = (product: Product) =>
  product.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || product.id;

export const readProductSlugFromHash = (): string | null => {
  const { hash } = window.location;
  if (!hash.startsWith(PRODUCT_HASH_PREFIX)) return null;
  const slug = decodeURIComponent(hash.slice(PRODUCT_HASH_PREFIX.length)).trim();
  return slug.length > 0 ? slug.toLowerCase() : null;
};

export const findProductBySlug = (products: Product[], slug: string) =>
  products.find((product) => toProductSlug(product) === slug || product.id === slug) ?? null;

export const toProductHash = (product: Product) =>
  `${PRODUCT_HASH_PREFIX}${encodeURIComponent(toProductSlug(product))}`;
