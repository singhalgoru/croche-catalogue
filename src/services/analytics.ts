import type { Product, ProductVariant } from '../types/product';
import { afterPageLoad } from '../utils/afterPageLoad';
import { isAutomatedVisit } from '../utils/automatedVisit';
import { getCampaignParameters } from '../utils/campaign';
import { INTERNAL_TRAFFIC_TYPE, isInternalTraffic } from '../utils/internalTraffic';
import { getPublicVariantPrice } from '../utils/productPrice';
import { canTrackMeta, initializeMetaPixel, metaProductParameters, trackMetaEvent } from './meta';
import { analyticsPage } from './analyticsPage';
import type { Cart, CartItem } from '../types/cart';
import { getCartTotals } from '../utils/cartMessage';

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
  if (!measurementId || isAdminRoute() || isAutomatedVisit() || window.gtag) return;

  window.dataLayer = window.dataLayer ?? [];
  window.gtag = function gtag(..._args: unknown[]) {
    window.dataLayer?.push(arguments);
  };
  window.gtag('js', new Date());
  window.gtag('config', measurementId, {
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    ...analyticsPage(),
    page_referrer: document.referrer ? analyticsPage(document.referrer).page_location : '',
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

export const canTrackAnalytics = () => Boolean(measurementId && !isAdminRoute() && !isAutomatedVisit() && window.gtag);

export const trackEvent = (name: string, parameters: AnalyticsParameters = {}) => {
  if (!canTrackAnalytics()) return false;
  window.gtag?.('event', name, { ...getCampaignParameters(), ...parameters, ...analyticsPage(),
    page_referrer: document.referrer ? analyticsPage(document.referrer).page_location : '' });
  return true;
};

let lastPage = '';
let pageTrackingStarted = false;
export const trackPageView = () => {
  if (isAdminRoute() || isAutomatedVisit()) return;
  const metaWasReady = canTrackMeta();
  initializeMetaPixel();
  const page = analyticsPage();
  if (page.page_location === lastPage) {
    if (!metaWasReady && canTrackMeta()) trackMetaEvent('PageView');
    return;
  }
  lastPage = page.page_location;
  trackEvent('page_view', { page_title: document.title });
  trackMetaEvent('PageView');
};

export const initializePageTracking = () => {
  if (pageTrackingStarted) return;
  pageTrackingStarted = true;
  trackPageView();
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = window.history[method].bind(window.history);
    window.history[method] = (data: unknown, unused: string, url?: string | URL | null) => {
      original(data, unused, url);
      window.requestAnimationFrame(trackPageView);
    };
  }
  window.addEventListener('popstate', trackPageView);
  window.addEventListener('hashchange', trackPageView);
};

export const cartItemParameters = (item: CartItem) => ({
  item_id: item.productId, item_name: item.productName, item_variant: item.variantName,
  variant_id: item.variantId, quantity: item.quantity,
  ...(item.unitPrice !== null ? { price: item.unitPrice } : {}),
});

export const cartParameters = (cart: Cart) => {
  const totals = getCartTotals(cart);
  return { currency: 'INR', ...(totals.hasCompletePricing ? { value: totals.subtotal - totals.discount } : {}),
    ...(cart.coupon ? { coupon: cart.coupon.code } : {}), items: cart.items.map(cartItemParameters) };
};

export const trackCartStep = (name: 'view_cart' | 'begin_checkout' | 'add_shipping_info' | 'add_payment_info', cart: Cart) => {
  trackEvent(name, { ...cartParameters(cart),
    ...(name === 'add_shipping_info' ? { shipping_tier: 'Standard delivery' } : {}),
    ...(name === 'add_payment_info' ? { payment_type: 'Razorpay' } : {}) });
  if (name === 'begin_checkout' || name === 'add_payment_info') {
    const { items: _items, ...parameters } = cartParameters(cart);
    trackMetaEvent(name === 'begin_checkout' ? 'InitiateCheckout' : 'AddPaymentInfo', {
      ...parameters, content_ids: cart.items.map(item => item.productId), content_type: 'product',
      num_items: cart.items.reduce((count, item) => count + item.quantity, 0),
    });
  }
};

export const trackCartChanges = (previous: Cart | null, next: Cart) => {
  const before = previous?.items ?? [];
  for (const item of [...next.items, ...before.filter(old => !next.items.some(value => value.productId === old.productId && value.variantId === old.variantId))]) {
    const old = before.find(value => value.productId === item.productId && value.variantId === item.variantId);
    const current = next.items.find(value => value.productId === item.productId && value.variantId === item.variantId);
    const delta = (current?.quantity ?? 0) - (old?.quantity ?? 0);
    if (!delta) continue;
    const snapshot = delta > 0 ? current! : old!;
    const quantity = Math.abs(delta);
    const parameters = { currency: 'INR', ...(snapshot.unitPrice !== null ? { value: snapshot.unitPrice * quantity } : {}),
      items: [cartItemParameters({ ...snapshot, quantity })] };
    trackEvent(delta > 0 ? 'add_to_cart' : 'remove_from_cart', parameters);
    if (delta > 0) trackMetaEvent('AddToCart', {
      currency: 'INR', ...(snapshot.unitPrice !== null ? { value: snapshot.unitPrice * quantity } : {}),
      content_ids: [snapshot.productId], content_name: snapshot.productName, content_type: 'product',
      variant_id: snapshot.variantId, num_items: quantity,
    });
  }
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
  const price = getPublicVariantPrice(product, variant);
  trackEvent('view_item', {
    currency: 'INR',
    ...(price !== null ? { value: price } : {}),
    items: [{ ...itemParameters(product, variant), ...(price !== null ? { price } : {}) }],
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
    ...(price !== undefined ? { value: price * quantity } : {}),
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
  const price = getPublicVariantPrice(product, variant);
  trackEvent('generate_lead', {
    lead_source: 'whatsapp', contact_location: 'product', currency: 'INR',
    ...(price !== null ? { value: price } : {}),
    items: [{ ...itemParameters(product, variant), ...(price !== null ? { price } : {}) }],
  });
  trackMetaEvent('Lead', { ...metaProductParameters(product, variant), lead_source: 'whatsapp' });
};

export const trackWhatsAppCart = (cart: Cart) => {
  const itemCount = cart.items.reduce((count, item) => count + item.quantity, 0);
  trackEvent('whatsapp_cart', { item_count: itemCount });
  trackEvent('generate_lead', { ...cartParameters(cart), lead_source: 'whatsapp', contact_location: 'cart' });
  const { items: _items, ...parameters } = cartParameters(cart);
  trackMetaEvent('Lead', { ...parameters, lead_source: 'whatsapp',
    content_ids: cart.items.map(item => item.productId), content_type: 'product', num_items: itemCount });
};

export const trackContactClick = (channel: string, location: string) => {
  trackEvent('contact_click', { channel, location });
  trackMetaEvent('Contact', { contact_channel: channel, contact_location: location });
};
