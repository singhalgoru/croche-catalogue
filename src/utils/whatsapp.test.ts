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
