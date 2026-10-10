import { afterEach, expect, it, vi } from 'vitest';
import type { Product } from '../types/product';
import { toProductPageUrl } from './productLink';

const product: Product = {
  id: 'bunny', name: 'Bunny Charm', category: 'Charms', description: '', price: 100,
  color: '#fff', inStock: true, image: '/bunny.webp', variants: [{
    id: 'lavender-id', name: 'Lavender', color: '#b57edc', price: null,
    inStock: true, availableQuantity: 1, image: '/bunny.webp', imagePath: 'bunny.webp', gallery: [],
  }],
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

it('uses the dedicated order number for general, product and cart enquiries', async () => {
  vi.stubEnv('VITE_WHATSAPP_NUMBER', '');
  const { getGeneralWhatsAppLink, getProductWhatsAppLink, getCartWhatsAppLink } = await import('./whatsapp');
  const links = [
    getGeneralWhatsAppLink(),
    getProductWhatsAppLink({
      id: 'rose', name: 'Rose', category: 'Flowers', description: '', price: 100,
      color: '#fff', inStock: true, image: '/rose.webp', variants: [],
    }),
    getCartWhatsAppLink({
      id: 'cart', reference: 'LC-1', status: 'active',
      updatedAt: '2026-10-03T00:00:00Z', expiresAt: '2026-10-10T00:00:00Z',
      whatsappStartedAt: null, items: [],
    }),
  ];
  for (const link of links) expect(new URL(link).pathname).toBe('/919205907350');
});

it('respects a configured WhatsApp number override', async () => {
  vi.stubEnv('VITE_WHATSAPP_NUMBER', ' 911234567890 ');
  const { getGeneralWhatsAppLink } = await import('./whatsapp');
  expect(new URL(getGeneralWhatsAppLink()).pathname).toBe('/911234567890');
});
it('does not include a cart identifier in checkout support messages', async () => {
  const { getCheckoutSupportWhatsAppLink } = await import('./whatsapp');
  const text = new URL(getCheckoutSupportWhatsAppLink()).searchParams.get('text')!;
  expect(text).toContain('help with online checkout');
  expect(text).not.toMatch(/CRT-|Cart reference|cart id/i);
});

it('includes the selected variant even for a single-variant product and links to that variant', async () => {
  const { getProductWhatsAppLink } = await import('./whatsapp');
  const text = new URL(getProductWhatsAppLink(product, product.variants[0])).searchParams.get('text')!;
  expect(text).toBe(`Hi Luvia, I'm interested in Bunny Charm — Lavender.\n\n${toProductPageUrl(product)}?variant=lavender`);
});

it('links enquiries without a selected variant to the full product page', async () => {
  const { getProductWhatsAppLink } = await import('./whatsapp');
  const text = new URL(getProductWhatsAppLink(product)).searchParams.get('text')!;
  expect(text).toBe(`Hi Luvia, I'm interested in Bunny Charm.\n\n${toProductPageUrl(product)}`);
  expect(text).not.toContain('variant');
});

it('prefills customisation requests with the selected product and variant without promising availability', async () => {
  const { getCustomisationWhatsAppLink } = await import('./whatsapp');
  const text = new URL(getCustomisationWhatsAppLink(product, product.variants[0])).searchParams.get('text')!;
  expect(text).toContain('Bunny Charm — Lavender');
  expect(text).toContain('My preferred colour or change:');
  expect(text).toContain('Please confirm what is possible, the price and dispatch estimate before I order.');
  expect(text).toContain(`${toProductPageUrl(product)}?variant=lavender`);
  const withoutVariant = new URL(getCustomisationWhatsAppLink(product)).searchParams.get('text')!;
  expect(withoutVariant).not.toContain('?variant=');
});
