import { describe, expect, it } from 'vitest';
import { buildWhatsAppCartMessage, getCartTotals } from './cartMessage';
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
    expect(totals).toEqual({ total: 1400, hasCompletePricing: true });
  });

  it('flags incomplete pricing but still totals the priced items', () => {
    const totals = getCartTotals(
      buildCart([buildItem(), buildItem({ id: 'i2', unitPrice: null, quantity: 3 })]),
    );
    expect(totals).toEqual({ total: 1000, hasCompletePricing: false });
  });
});

describe('buildWhatsAppCartMessage', () => {
  it('bolds each product name so the list is scannable in chat', () => {
    const message = buildWhatsAppCartMessage(buildCart([buildItem()]));
    expect(message).toContain('*1. Cute Bunny*');
    expect(message).toContain('*Total: ₹1,000*');
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

  it('puts a product link first so WhatsApp previews the product photo', () => {
    const message = buildWhatsAppCartMessage(buildCart([buildItem()]));
    const firstLink = message.split('\n').find((line) => line.startsWith('http'));
    expect(firstLink).toContain('/p/cute-bunny--p1/');
  });

  it('asks for confirmation when an item has no price', () => {
    const message = buildWhatsAppCartMessage(buildCart([buildItem({ unitPrice: null })]));
    expect(message).toContain('Qty 2 — Price on enquiry');
    expect(message).toContain('*Total: please confirm*');
  });

  it('carries the cart reference so the order can be matched later', () => {
    expect(buildWhatsAppCartMessage(buildCart([buildItem()]))).toContain(
      'Cart reference: LUV-1234',
    );
  });
});
