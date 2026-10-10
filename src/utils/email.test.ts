import { describe, expect, it } from 'vitest';
import {
  getCartEmailLink,
  getCartEmailText,
  getCartGmailLink,
  MAX_MAILTO_LENGTH,
  ORDERS_EMAIL,
} from './email';
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

const decodeBody = (link: string) =>
  decodeURIComponent(link.split('&body=')[1] ?? '');

describe('getCartEmailLink', () => {
  it('addresses the orders inbox without exposing the cart reference in the subject', () => {
    const link = getCartEmailLink(buildCart([buildItem()]));
    expect(link.startsWith(`mailto:${ORDERS_EMAIL}?subject=`)).toBe(true);
    expect(decodeURIComponent(link.split('?subject=')[1].split('&body=')[0])).toBe(
      'Order request — Luvia',
    );
  });

  it('lists every item with quantity, unit price and line total', () => {
    const link = getCartEmailLink(
      buildCart([
        buildItem(),
        buildItem({ id: 'item-2', productName: 'Rose Gajra', variantName: 'Red', unitPrice: 400, quantity: 1 }),
      ]),
    );
    const body = decodeBody(link);
    expect(body).toContain('1. Cute Bunny');
    expect(body).toContain('   Quantity    : 2');
    expect(body).toContain('   Unit price  : ₹500');
    expect(body).toContain('   Line total  : ₹1,000');
    expect(body).toContain('2. Rose Gajra');
    expect(body).toContain('   Variant     : Red');
    expect(body).toContain('ITEMS SUBTOTAL : ₹1,400');
    expect(body).toContain('SHIPPING       : Free (orders ₹500+)');
    expect(body).toContain('ESTIMATED TOTAL : ₹1,400');
  });

  it('lists estimated shipping separately for orders below the free-shipping threshold', () => {
    const body = decodeBody(
      getCartEmailLink(buildCart([buildItem({ unitPrice: 300, quantity: 1 })])),
    );
    expect(body).toContain('ITEMS SUBTOTAL : ₹300');
    expect(body).toContain('INDICATIVE SHIPPING : ₹100');
    expect(body).toContain('ESTIMATED TOTAL : ₹400 (shipping indicative)');
  });

  it('links each item to its catalogue page, where the photo is shown', () => {
    const body = decodeBody(getCartEmailLink(buildCart([buildItem()])));
    expect(body).toMatch(/ {3}Product {5}: https?:\/\/[^\s]*\/p\/cute-bunny\//);
  });

  it('asks for confirmation instead of a total when an item is priced on enquiry', () => {
    const link = getCartEmailLink(buildCart([buildItem({ unitPrice: null })]));
    const body = decodeBody(link);
    expect(body).toContain('Price on enquiry');
    expect(body).toContain('ESTIMATED TOTAL : please confirm');
    expect(body).not.toContain('Line total');
  });

  it('includes a delivery details form so the customer knows what to supply', () => {
    const body = decodeBody(getCartEmailLink(buildCart([buildItem()])));
    expect(body).toContain('DELIVERY DETAILS');
    expect(body).toContain('Pincode     :');
    expect(body).not.toContain('LUV-1234');
    expect(body).not.toContain('Cart reference');
  });

  it('stays within the mailto length clients truncate at for a typical cart', () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      buildItem({ id: `item-${i}`, productId: `p${i}`, productName: `Handmade Crochet Item ${i}` }),
    );
    const link = getCartEmailLink(buildCart(many));
    expect(link.length).toBeLessThanOrEqual(MAX_MAILTO_LENGTH);
  });

  it('keeps every item when it falls back to the compact layout', () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      buildItem({ id: `item-${i}`, productId: `p${i}`, productName: `Handmade Crochet Item ${i}` }),
    );
    const body = decodeBody(getCartEmailLink(buildCart(many)));
    expect(body).toContain('1. Handmade Crochet Item 0');
    expect(body).toContain('25. Handmade Crochet Item 24');
    expect(body).toContain('DELIVERY DETAILS');
  });

  it('keeps a product link per item in the compact layout, since that is where the photo is', () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      buildItem({ id: `item-${i}`, productId: `p${i}`, productName: `Handmade Crochet Item ${i}` }),
    );
    const body = decodeBody(getCartEmailLink(buildCart(many)));
    expect(body).toContain('/p/handmade-crochet-item-0/');
    expect(body).toContain('/p/handmade-crochet-item-24/');
  });

  it('front-loads the order ahead of the optional delivery form so truncation degrades gracefully', () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      buildItem({ id: `item-${i}`, productId: `p${i}`, productName: `Handmade Crochet Item ${i}` }),
    );
    const body = decodeBody(getCartEmailLink(buildCart(many)));
    // A client that cuts the body short should lose the blank form, not the order.
    expect(body.indexOf('ESTIMATED TOTAL')).toBeLessThan(body.indexOf('DELIVERY DETAILS'));
    expect(body).not.toContain('Cart reference');
  });
});

describe('getCartGmailLink', () => {
  it('opens a Gmail compose window addressed to the orders inbox', () => {
    const link = getCartGmailLink(buildCart([buildItem()]));
    expect(link.startsWith('https://mail.google.com/mail/?view=cm')).toBe(true);
    expect(link).toContain(`to=${encodeURIComponent(ORDERS_EMAIL)}`);
  });

  it('carries the same order details as the mailto link', () => {
    const link = getCartGmailLink(buildCart([buildItem()]));
    const body = decodeURIComponent(link.split('&body=')[1]);
    expect(body).toContain('ORDER SUMMARY');
    expect(body).toContain('Cute Bunny');
    expect(body).toContain('DELIVERY DETAILS');
  });
});

describe('getCartEmailText', () => {
  it('pairs the subject with the order so it can be pasted anywhere', () => {
    const text = getCartEmailText(buildCart([buildItem()]));
    expect(text).toContain('Order request — Luvia');
    expect(text).not.toContain('LUV-1234');
    expect(text).toContain('ORDER SUMMARY');
    expect(text).toContain('Cute Bunny');
  });
});
