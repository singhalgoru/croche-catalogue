import { afterEach, expect, it, vi } from 'vitest';

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
