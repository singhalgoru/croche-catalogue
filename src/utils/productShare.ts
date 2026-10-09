import type { Product, ProductVariant } from '../types/product';
import { toProductPageUrl, toProductVariantPageUrl, toPublicVariantSlug } from './productLink';

export const getProductShareDetails = (product: Product, variant?: ProductVariant) => {
  const productUrl = new URL(toProductPageUrl(product));
  if (variant) productUrl.searchParams.set('variant', toPublicVariantSlug(variant));
  const url = productUrl.href;
  const title =
    variant && product.variants.length > 1
      ? `${product.name} — ${variant.name}`
      : product.name;
  const text = `See ${title} from Luvia`;
  const redditProductUrl = new URL(variant ? toProductVariantPageUrl(product, variant) : url);
  redditProductUrl.searchParams.set('utm_source', 'reddit');
  redditProductUrl.searchParams.set('utm_medium', 'social');
  redditProductUrl.searchParams.set('utm_campaign', 'product_share');
  redditProductUrl.searchParams.set('utm_content', product.publicSlug ?? product.id);

  return {
    title,
    text,
    url,
    redditProductUrl: redditProductUrl.href,
    whatsappUrl: `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`,
    facebookUrl: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    redditUrl: `https://www.reddit.com/submit?url=${encodeURIComponent(redditProductUrl.href)}&title=${encodeURIComponent(title)}`,
  };
};
