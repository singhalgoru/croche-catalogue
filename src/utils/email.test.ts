import { describe, expect, it } from 'vitest';
import { getCartEmailLink, ORDERS_EMAIL } from './email';
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
  it('addresses the orders inbox and includes the cart reference in the subject', () => {
    const link = getCartEmailLink(buildCart([buildItem()]));
    expect(link.startsWith(`mailto:${ORDERS_EMAIL}?subject=`)).toBe(true);
    expect(decodeURIComponent(link.split('?subject=')[1].split('&body=')[0])).toBe(
      'Order request — Luvia cart LUV-1234',
    );
  });

  it('lists every item with quantity and price, plus the estimated total', () => {
    const link = getCartEmailLink(
      buildCart([
        buildItem(),
        buildItem({ id: 'item-2', productName: 'Rose Gajra', variantName: 'Red', unitPrice: 400, quantity: 1 }),
      ]),
    );
    const body = decodeBody(link);
    expect(body).toContain('1. Cute Bunny');
    expect(body).toContain('   Quantity: 2');
    expect(body).toContain('2. Rose Gajra');
    expect(body).toContain('   Variant: Red');
    expect(body).toContain('Estimated total: ₹1,400');
  });

  it('asks for confirmation instead of a total when an item is priced on enquiry', () => {
    const link = getCartEmailLink(buildCart([buildItem({ unitPrice: null })]));
    const body = decodeBody(link);
    expect(body).toContain('Price on enquiry');
    expect(body).toContain('Total: Please confirm');
    expect(body).not.toContain('Estimated total:');
  });

  it('includes a delivery details form so the customer knows what to supply', () => {
    const body = decodeBody(getCartEmailLink(buildCart([buildItem()])));
    expect(body).toContain('My delivery details:');
    expect(body).toContain('Pincode:');
    expect(body).toContain('Cart reference: LUV-1234');
  });
});
