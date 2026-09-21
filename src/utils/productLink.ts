import type { Product } from '../types/product';

type LinkableProduct = Pick<Product, 'id' | 'name'>;

const PRODUCT_HASH_PREFIX = '#product=';
const REFERENCE_SEPARATOR = '--';

export const toProductSlug = (product: LinkableProduct) =>
  product.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || product.id;

/**
 * Campaign links use `<slug>--<id>` so the URL stays readable while the trailing
 * product id keeps it resolvable after a product is renamed.
 */
export const toProductReference = (product: LinkableProduct) => {
  const slug = toProductSlug(product);
  const id = product.id.toLowerCase();
  return slug === id ? id : `${slug}${REFERENCE_SEPARATOR}${id}`;
};

export const readProductReferenceFromHash = (): string | null => {
  const { hash } = window.location;
  if (!hash.startsWith(PRODUCT_HASH_PREFIX)) return null;
  const reference = decodeURIComponent(hash.slice(PRODUCT_HASH_PREFIX.length)).trim();
  return reference.length > 0 ? reference.toLowerCase() : null;
};

export const findProductByReference = (products: Product[], reference: string) => {
  const normalized = reference.trim().toLowerCase();
  if (normalized === '') return null;

  const separatorIndex = normalized.lastIndexOf(REFERENCE_SEPARATOR);
  const id =
    separatorIndex === -1
      ? normalized
      : normalized.slice(separatorIndex + REFERENCE_SEPARATOR.length);
  const byId = products.find((product) => product.id.toLowerCase() === id);
  if (byId) return byId;

  const slug = separatorIndex === -1 ? normalized : normalized.slice(0, separatorIndex);
  return products.find((product) => toProductSlug(product) === slug) ?? null;
};

export const toProductHash = (product: LinkableProduct) =>
  `${PRODUCT_HASH_PREFIX}${encodeURIComponent(toProductReference(product))}`;

/** Absolute, rename-proof link suitable for ad destinations and sharing. */
export const toProductUrl = (product: LinkableProduct) => {
  const base = new URL(import.meta.env.BASE_URL, window.location.origin);
  return `${base.href}${toProductHash(product)}`;
};
