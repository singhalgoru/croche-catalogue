import { describe, expect, it } from 'vitest';
import { buildEmailCartBody, buildWhatsAppCartMessage, getCartTotals } from './cartMessage';
import type { Cart } from '../types/cart';

const buildCart = (items: Cart['items']): Cart => ({
  id: 'cart-1',
  reference: 'LUV-1234',
  status: 'active',
  updatedAt: '2026-01-01T00:00:00.000Z',
  expiresAt: '2026-02-01T00:00:00.000Z',
  whatsappStartedAt: null,
  items,
});

const buildItem = (overrides: Partial<Cart['items'][number]> = {}) => ({
  id: 'item-1',
  productId: 'p1',
  variantId: 'v1',
  productName: 'Cute Bunny',
  variantName: '',
  image: 'bunny.jpg',
  unitPrice: 500,
  quantity: 2,
  ...overrides,
});

describe('getCartTotals', () => {
  it('sums quantity times unit price', () => {
    const totals = getCartTotals(
      buildCart([buildItem(), buildItem({ id: 'i2', unitPrice: 400, quantity: 1 })]),
    );
    expect(totals).toEqual({
      subtotal: 1400, shipping: 0, total: 1400, hasCompletePricing: true,
    });
  });

  it('flags incomplete pricing but still totals the priced items', () => {
    const totals = getCartTotals(
      buildCart([buildItem(), buildItem({ id: 'i2', unitPrice: null, quantity: 3 })]),
    );
    expect(totals).toEqual({
      subtotal: 1000, shipping: 0, total: 1000, hasCompletePricing: false,
    });
  });

  it('adds indicative shipping below ₹500 and waives it at the threshold', () => {
    expect(getCartTotals(buildCart([buildItem({ unitPrice: 300, quantity: 1 })]))).toMatchObject({
      subtotal: 300, shipping: 100, total: 400,
    });
    expect(getCartTotals(buildCart([buildItem({ unitPrice: 250, quantity: 2 })]))).toMatchObject({
      subtotal: 500, shipping: 0, total: 500,
    });
  });
});

describe('buildWhatsAppCartMessage', () => {
  it('includes only a saved voluntary PIN in WhatsApp and email enquiries', () => {
    const cart = { ...buildCart([buildItem()]), deliveryPinCode: '110001' };
    expect(buildWhatsAppCartMessage(cart)).toContain('Delivery pincode (shopper-provided): 110001');
    expect(buildEmailCartBody(cart)).toContain('Pincode     : 110001 (shopper-provided)');
    expect(buildWhatsAppCartMessage({ ...cart, deliveryPinCode: null })).not.toContain('Delivery pincode');
  });
  it('bolds each product name so the list is scannable in chat', () => {
    const message = buildWhatsAppCartMessage(buildCart([buildItem()]));
    expect(message).toContain('*1. Cute Bunny*');
    expect(message).toContain('*Total: ₹1,000*');
    expect(message).toContain('*Shipping: Free (orders ₹500+)*');
  });

  it('shows the variant beside the name when there is one', () => {
    const message = buildWhatsAppCartMessage(
      buildCart([buildItem({ variantName: 'Ivory/White' })]),
    );
    expect(message).toContain('*1. Cute Bunny* (Ivory/White)');
  });

  it('spells out quantity, unit price and line total on one line', () => {
    const message = buildWhatsAppCartMessage(buildCart([buildItem()]));
    expect(message).toContain('Qty 2 × ₹500 = ₹1,000');
  });

  it('shows an indicative shipping charge separately below the free-shipping threshold', () => {
    const message = buildWhatsAppCartMessage(
      buildCart([buildItem({ unitPrice: 300, quantity: 1 })]),
    );
    expect(message).toContain('*Items subtotal: ₹300*');
    expect(message).toContain('*Indicative shipping: ₹100*');
    expect(message).toContain('*Estimated total: ₹400 (shipping indicative)*');
  });

  it('puts a product link first so WhatsApp previews the product photo', () => {
    const message = buildWhatsAppCartMessage(buildCart([buildItem()]));
    const firstLink = message.split('\n').find((line) => line.startsWith('http'));
    expect(firstLink).toContain('/p/cute-bunny/');
  });

  it('uses the saved public slug so renamed products keep valid cart links', () => {
    const message = buildWhatsAppCartMessage(
      buildCart([buildItem({ productName: 'Renamed Bunny', productSlug: 'cute-bunny' })]),
    );
    const firstLink = message.split('\n').find((line) => line.startsWith('http'));
    expect(firstLink).toContain('/p/cute-bunny/');
    expect(firstLink).not.toContain('renamed-bunny');
  });

  it('asks for confirmation when an item has no price', () => {
    const message = buildWhatsAppCartMessage(buildCart([buildItem({ unitPrice: null })]));
    expect(message).toContain('Qty 2 — Price on enquiry');
    expect(message).toContain('*Estimated total: please confirm*');
  });

  it('carries the cart reference so the order can be matched later', () => {
    expect(buildWhatsAppCartMessage(buildCart([buildItem()]))).toContain(
      'Cart reference: LUV-1234',
    );
  });
});
