import type { Product, ProductVariant } from '../types/product';
import { toProductPageUrl, toPublicVariantSlug } from './productLink';

export const getProductShareDetails = (product: Product, variant?: ProductVariant) => {
  const productUrl = new URL(toProductPageUrl(product));
  if (variant) productUrl.searchParams.set('variant', toPublicVariantSlug(variant));
  const url = productUrl.href;
  const title =
    variant && product.variants.length > 1
      ? `${product.name} — ${variant.name}`
      : product.name;
  const text = `See ${title} from Luvia`;

  return {
    title,
    text,
    url,
    whatsappUrl: `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`,
    facebookUrl: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    redditUrl: `https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`,
  };
};
