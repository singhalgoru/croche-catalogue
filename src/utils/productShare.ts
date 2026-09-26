import type { Product, ProductVariant } from '../types/product';
import { toProductUrl } from './productLink';

export const getProductShareDetails = (product: Product, variant?: ProductVariant) => {
  const url = toProductUrl(product);
  const title = variant ? `${product.name} — ${variant.name}` : product.name;
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
