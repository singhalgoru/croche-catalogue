import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Cart } from '../types/cart';
import type { Product } from '../types/product';

const cart: Cart = {
  id: 'private-cart-id', reference: 'CRT-TEST', status: 'active', updatedAt: '', expiresAt: '', whatsappStartedAt: null,
  deliveryDetails: { name: 'Private Buyer', phone: '9876543210', email: 'private@example.test',
    addressLine1: 'Private Street', addressLine2: '', city: 'Delhi', state: 'Delhi', pincode: '110001' },
  items: [{ id: 'private-item-id', productId: 'rose', variantId: 'pink', productName: 'Rose',
    variantName: 'Pink', image: '/photo.webp', unitPrice: 200, quantity: 3 }],
};
const ga = vi.fn();
const meta = Object.assign(vi.fn(), { queue: [] as unknown[][] });
const pushState = history.pushState;
const replaceState = history.replaceState;
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-TEST');
  vi.stubEnv('VITE_META_PIXEL_ID', '123');
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '/');
  window.gtag = ga;
  window.fbq = meta;
  vi.clearAllMocks();
});
afterEach(() => {
  history.pushState = pushState;
  history.replaceState = replaceState;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  delete window.gtag;
  delete window.fbq;
});

it('tracks actual added quantities and both GA and Meta values, then removal deltas', async () => {
  const { trackCartChanges } = await import('./analytics');
  trackCartChanges(null, cart);
  expect(ga).toHaveBeenCalledWith('event', 'add_to_cart', expect.objectContaining({
    currency: 'INR', value: 600, items: [expect.objectContaining({ quantity: 3, price: 200 })],
  }));
  expect(meta).toHaveBeenCalledWith('track', 'AddToCart', expect.objectContaining({ value: 600, num_items: 3 }));
  ga.mockClear(); meta.mockClear();
  const increased = { ...cart, items: [{ ...cart.items[0], quantity: 4 }] };
  trackCartChanges(cart, increased);
  expect(ga).toHaveBeenCalledWith('event', 'add_to_cart', expect.objectContaining({ value: 200 }));
  trackCartChanges(increased, { ...cart, items: [] });
  expect(ga).toHaveBeenCalledWith('event', 'remove_from_cart', expect.objectContaining({ value: 800 }));
  expect(meta).toHaveBeenCalledTimes(1);
  ga.mockClear();
  trackCartChanges(cart, cart);
  expect(ga).not.toHaveBeenCalled();
});

it('tracks the full checkout funnel without customer details or unknown prices as zero', async () => {
  const { trackCartStep } = await import('./analytics');
  for (const step of ['view_cart', 'begin_checkout', 'add_shipping_info', 'add_payment_info'] as const) trackCartStep(step, cart);
  expect(ga.mock.calls.map(call => call[1])).toEqual(['view_cart', 'begin_checkout', 'add_shipping_info', 'add_payment_info']);
  expect(meta.mock.calls.map(call => call[1])).toEqual(['InitiateCheckout', 'AddPaymentInfo']);
  const payload = JSON.stringify([ga.mock.calls, meta.mock.calls]);
  for (const privateValue of ['Private Buyer', 'private@example.test', '9876543210', 'Private Street', 'private-cart-id']) {
    expect(payload).not.toContain(privateValue);
  }
  ga.mockClear();
  trackCartStep('view_cart', { ...cart, items: [{ ...cart.items[0], unitPrice: null }] });
  expect(ga.mock.calls[0][2]).not.toHaveProperty('value');
});

it('tracks initial and SPA page changes once while stripping auth and request parameters', async () => {
  const { initializePageTracking, trackPageView } = await import('./analytics');
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { callback(0); return 1; });
  initializePageTracking();
  initializePageTracking();
  history.pushState(null, '', '/?checkout=delivery&checkoutRequest=secret&email=private@example.test#access_token=secret');
  history.replaceState(null, '', '/?checkout=delivery&release=123');
  history.pushState(null, '', '/?checkout=review');
  history.replaceState(null, '', '/?account=orders');
  trackPageView();
  const pages = ga.mock.calls.filter(call => call[1] === 'page_view');
  expect(pages.map(call => call[2].page_path)).toEqual(['/', '/?checkout=delivery', '/?checkout=review', '/?account=orders']);
  expect(JSON.stringify(pages)).not.toContain('secret');
  expect(JSON.stringify(pages)).not.toContain('private@example.test');
  expect(meta.mock.calls.filter(call => call[1] === 'PageView')).toHaveLength(3);
});

it('suppresses admin and internal Meta events', async () => {
  const { trackCartStep } = await import('./analytics');
  history.replaceState(null, '', '/#admin');
  trackCartStep('begin_checkout', cart);
  expect(ga).not.toHaveBeenCalled();
  expect(meta).not.toHaveBeenCalled();
  history.replaceState(null, '', '/');
  localStorage.setItem('luvia:internal-traffic', 'true');
  trackCartStep('begin_checkout', cart);
  expect(ga).toHaveBeenCalledTimes(1);
  expect(meta).not.toHaveBeenCalled();
});

it('does not initialize or emit Meta events while authentication tokens are in the URL', async () => {
  const { initializeMetaPixel, trackMetaEvent } = await import('./meta');
  history.replaceState(null, '', '/#access_token=secret&type=email_change');
  trackMetaEvent('PageView');
  expect(meta).not.toHaveBeenCalled();
  delete window.fbq;
  initializeMetaPixel();
  expect(window.fbq).toBeUndefined();
});
it('records WhatsApp cart purchase intent as a lead, never as a purchase', async () => {
  const { trackWhatsAppCart, trackContactClick } = await import('./analytics');
  trackWhatsAppCart(cart);
  expect(ga).toHaveBeenCalledWith('event', 'generate_lead', expect.objectContaining({
    lead_source: 'whatsapp', contact_location: 'cart', currency: 'INR', value: 600,
    items: [expect.objectContaining({ item_id: 'rose', quantity: 3 })],
  }));
  expect(meta).toHaveBeenCalledWith('track', 'Lead', expect.objectContaining({ lead_source: 'whatsapp', num_items: 3 }));
  expect(ga.mock.calls.some(call => call[1] === 'purchase')).toBe(false);
  const payload = JSON.stringify([ga.mock.calls, meta.mock.calls]);
  for (const privateValue of ['Private Buyer', 'private@example.test', '9876543210', 'Private Street', 'private-cart-id']) {
    expect(payload).not.toContain(privateValue);
  }
  ga.mockClear(); meta.mockClear();
  trackContactClick('whatsapp', 'footer');
  expect(ga.mock.calls.some(call => call[1] === 'generate_lead')).toBe(false);
});
it('records product WhatsApp intent with known prices only', async () => {
  const { trackWhatsAppEnquiry } = await import('./analytics');
  const product: Product = { id: 'rose', name: 'Rose', category: 'Flowers', price: 200, showPrice: true,
    description: 'Handmade rose', color: 'pink', inStock: true, image: '/rose.jpg', variants: [] };
  trackWhatsAppEnquiry(product);
  expect(ga).toHaveBeenCalledWith('event', 'generate_lead', expect.objectContaining({
    lead_source: 'whatsapp', contact_location: 'product', value: 200,
    items: [expect.objectContaining({ item_id: 'rose', price: 200 })],
  }));
  expect(meta).toHaveBeenCalledWith('track', 'Lead', expect.objectContaining({ lead_source: 'whatsapp' }));
  ga.mockClear();
  trackWhatsAppEnquiry({ ...product, price: null });
  const lead = ga.mock.calls.find(call => call[1] === 'generate_lead')!;
  expect(lead[2]).not.toHaveProperty('value');
  expect(lead[2].items[0]).not.toHaveProperty('price');
});
