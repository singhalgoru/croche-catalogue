import type { Product, ProductVariant } from '../types/product';
import { getPublicVariantPrice } from '../utils/productPrice';

type MetaParameters = Record<string, unknown>;

interface MetaPixel {
  (...args: unknown[]): void;
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[][];
  loaded?: boolean;
  version?: string;
  push?: unknown;
}

declare global {
  interface Window {
    fbq?: MetaPixel;
    _fbq?: MetaPixel;
  }
}

const pixelId = import.meta.env.VITE_META_PIXEL_ID?.trim();

const isAdminRoute = () => window.location.hash === '#admin';

export const initializeMetaPixel = () => {
  if (!pixelId || isAdminRoute() || window.fbq) return;

  // Mirrors Meta's loader stub: events are queued until fbevents.js takes over.
  const pixel = Object.assign(
    (...args: unknown[]) => {
      const current = window.fbq;
      if (!current) return;
      if (current.callMethod) current.callMethod.apply(current, args);
      else current.queue.push(args);
    },
    { queue: [] as unknown[][], loaded: true, version: '2.0' },
  ) as MetaPixel;
  pixel.push = pixel;

  window.fbq = pixel;
  window._fbq = window._fbq ?? pixel;

  window.fbq('init', pixelId);
  window.fbq('track', 'PageView');

  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://connect.facebook.net/en_US/fbevents.js';
  document.head.append(script);
};

export const trackMetaEvent = (name: string, parameters: MetaParameters = {}) => {
  if (!pixelId || isAdminRoute() || !window.fbq) return;
  window.fbq('track', name, parameters);
};

export const metaProductParameters = (product: Product, variant?: ProductVariant) => {
  const price = getPublicVariantPrice(product, variant);
  return {
    content_ids: [product.id],
    content_name: variant ? `${product.name} — ${variant.name}` : product.name,
    content_category: product.category,
    content_type: 'product',
    // A value lets Meta optimise towards higher-worth enquiries.
    ...(price !== null && price > 0 ? { value: price, currency: 'INR' } : {}),
  };
};
