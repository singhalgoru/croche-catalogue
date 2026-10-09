import type { Product, ProductVariant } from '../types/product';

type LinkableProduct = Pick<Product, 'id' | 'name'> & Partial<Pick<Product, 'publicSlug'>>;
type LinkableVariant = Pick<ProductVariant, 'id' | 'name'> & Partial<Pick<ProductVariant, 'publicSlug'>>;

const PRODUCT_HASH_PREFIX = '#product=';
const REFERENCE_SEPARATOR = '--';

export const toProductSlug = (product: LinkableProduct) =>
  product.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || product.id;

export const toPublicProductSlug = (product: LinkableProduct & { publicSlug?: string }) =>
  product.publicSlug || toProductSlug(product);

export const toPublicVariantSlug = (variant: LinkableVariant) =>
  variant.publicSlug || variant.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || `variant-${variant.id.toLowerCase().replace(/-/g, '').slice(0, 8)}`;

export const findProductVariantByReference = (product: Product, reference: string) =>
  product.variants.find((variant) =>
    variant.id.toLowerCase() === reference.toLowerCase()
    || toPublicVariantSlug(variant) === reference.toLowerCase());

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

export const readProductPageReference = (): string | null => {
  const base = new URL(import.meta.env.BASE_URL, window.location.origin).pathname;
  const path = window.location.pathname.slice(base.length);
  const match = path.match(/^p\/([^/]+)(?:\/variant\/[^/]+)?\/?$/);
  const reference = match?.[1] ?? new URLSearchParams(window.location.search).get('productPage');
  if (!reference) return null;
  try {
    return decodeURIComponent(reference).trim().toLowerCase() || null;
  } catch {
    return null;
  }
};

export const readProductVariantReference = (): string | null => {
  const query = new URLSearchParams(window.location.search).get('variant');
  if (query) return query;
  const base = new URL(import.meta.env.BASE_URL, window.location.origin).pathname;
  const match = window.location.pathname.slice(base.length).match(/^p\/[^/]+\/variant\/([^/]+)\/?$/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]).trim().toLowerCase() || null;
  } catch {
    return null;
  }
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
  return products.find((product) =>
    (product.publicSlug && product.publicSlug.toLowerCase() === normalized)
    || toProductSlug(product) === slug) ?? null;
};

export const toProductHash = (product: LinkableProduct) =>
  `${PRODUCT_HASH_PREFIX}${encodeURIComponent(toProductReference(product))}`;

/** Absolute, rename-proof link suitable for ad destinations and sharing. */
export const toProductUrl = (product: LinkableProduct) => {
  return toProductPageUrl(product);
};

/**
 * Shared product pages contain crawlable content and boot the same interactive
 * product view as the catalogue. The 404 fallback handles newly published pages.
 */
export const toProductPageUrl = (product: LinkableProduct) => {
  const base = new URL(import.meta.env.BASE_URL, window.location.origin);
  return `${base.href}p/${encodeURIComponent(toPublicProductSlug(product))}/`;
};

export const toProductVariantPageUrl = (product: LinkableProduct, variant: LinkableVariant) =>
  `${toProductPageUrl(product)}variant/${encodeURIComponent(toPublicVariantSlug(variant))}/`;
