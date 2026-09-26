import type { Product, ProductVariant } from '../types/product';
import { afterPageLoad } from '../utils/afterPageLoad';
import { getCampaignParameters } from '../utils/campaign';
import { INTERNAL_TRAFFIC_TYPE, isInternalTraffic } from '../utils/internalTraffic';
import { getPublicVariantPrice } from '../utils/productPrice';
import { metaProductParameters, trackMetaEvent } from './meta';

type AnalyticsParameters = Record<string, unknown>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID?.trim();

const isAdminRoute = () => window.location.hash === '#admin';

export const initializeAnalytics = () => {
  if (!measurementId || isAdminRoute() || window.gtag) return;

  window.dataLayer = window.dataLayer ?? [];
  window.gtag = function gtag(..._args: unknown[]) {
    window.dataLayer?.push(arguments);
  };
  window.gtag('js', new Date());
  window.gtag('config', measurementId, {
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    page_path: `${window.location.pathname}${window.location.search}`,
    page_title: document.title,
    // Tagging rather than dropping the hit lets GA4's Internal Traffic filter
    // exclude it from reports while keeping it visible in DebugView.
    ...(isInternalTraffic() ? { traffic_type: INTERNAL_TRAFFIC_TYPE } : {}),
  });

  afterPageLoad(() => {
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    document.head.append(script);
  });
};

export const trackEvent = (name: string, parameters: AnalyticsParameters = {}) => {
  if (!measurementId || isAdminRoute() || !window.gtag) return;
  window.gtag('event', name, { ...getCampaignParameters(), ...parameters });
};

const itemParameters = (product: Product, variant?: ProductVariant) => ({
  item_id: product.id,
  item_name: product.name,
  item_category: product.category,
  ...(variant
    ? {
        item_variant: variant.name,
        variant_id: variant.id,
      }
    : {}),
});

export const trackProductSelected = (product: Product) => {
  trackEvent('select_item', {
    item_list_name: 'Catalogue',
    items: [itemParameters(product)],
  });
};

export const trackProductViewed = (product: Product, variant?: ProductVariant) => {
  trackEvent('view_item', {
    items: [itemParameters(product, variant)],
  });
  trackMetaEvent('ViewContent', metaProductParameters(product, variant));
};

export const trackAddToCart = (
  product: Product,
  variant: ProductVariant,
  quantity = 1,
) => {
  const publicPrice = getPublicVariantPrice(product, variant);
  const price = publicPrice === null ? undefined : publicPrice;
  trackEvent('add_to_cart', {
    currency: 'INR',
    ...(price !== undefined ? { value: price * quantity } : {}),
    items: [
      {
        ...itemParameters(product, variant),
        quantity,
        ...(price !== undefined ? { price } : {}),
      },
    ],
  });
  trackMetaEvent('AddToCart', {
    ...getCampaignParameters(),
    ...metaProductParameters(product, variant),
    variant_id: variant.id,
    variant_name: variant.name,
    num_items: quantity,
  });
};

export const trackWhatsAppEnquiry = (product: Product, variant?: ProductVariant) => {
  trackEvent('whatsapp_enquiry', {
    product_id: product.id,
    product_name: product.name,
    variant_name: variant?.name,
  });
  trackMetaEvent('Contact', {
    ...metaProductParameters(product, variant),
    contact_channel: 'whatsapp',
  });
};

export const trackContactClick = (channel: string, location: string) => {
  trackEvent('contact_click', { channel, location });
  trackMetaEvent('Contact', { contact_channel: channel, contact_location: location });
};
