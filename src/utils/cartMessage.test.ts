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
      subtotal: 1400, discount: 0, couponShortfall: 0, shipping: 0, total: 1400, hasCompletePricing: true, shippingSource: 'free',
    });
  });

  it('flags incomplete pricing but still totals the priced items', () => {
    const totals = getCartTotals(
      buildCart([buildItem(), buildItem({ id: 'i2', unitPrice: null, quantity: 3 })]),
    );
    expect(totals).toEqual({
      subtotal: 1000, discount: 0, couponShortfall: 0, shipping: 0, total: 1000, hasCompletePricing: false, shippingSource: 'free',
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

  it('uses a current Shiprocket estimate instead of the flat fee and labels it', () => {
    const estimate = { provider: 'shiprocket' as const, currency: 'INR' as const, minCharge: 61, maxCharge: 90,
      minDays: 3, maxDays: 5, weightGrams: 500, itemCount: 1, checkedAt: '2026-01-01T00:00:00.000Z' };
    const cart = { ...buildCart([buildItem({ unitPrice: 300, quantity: 1 })]), deliveryPinCode: '110001', deliveryEstimate: estimate };
    expect(getCartTotals(cart)).toMatchObject({ shipping: 70, total: 370, shippingSource: 'estimate' });
    expect(buildWhatsAppCartMessage(cart)).toContain('Approx. shipping to 110001');
    expect(buildEmailCartBody(cart)).toContain('APPROX. SHIPPING (110001)');
    const changed = { ...cart, items: [buildItem({ unitPrice: 200, quantity: 2 })] };
    expect(getCartTotals(changed)).toMatchObject({ shipping: 100, shippingSource: 'flat' });
    expect(getCartTotals({ ...cart, deliveryPinCode: null })).toMatchObject({ shippingSource: 'flat' });
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

  it('does not expose internal cart identifiers in customer messages', () => {
    const message = buildWhatsAppCartMessage(buildCart([buildItem()]));
    expect(message).not.toContain('LUV-1234');
    expect(message).not.toContain('Cart reference');
  });
});

describe('coupon discount', () => {
  const coupon = { code: 'ILOVELUVIA', percent: 10, maxDiscountRupees: 100, minimumSubtotalRupees: 500 };
  it.each([
    { subtotal: 500, discount: 50, shipping: 100, total: 550 },
    { subtotal: 554, discount: 55, shipping: 100, total: 599 },
    { subtotal: 555, discount: 55, shipping: 0, total: 500 },
    { subtotal: 600, discount: 60, shipping: 0, total: 540 },
  ])('checks shipping after discount for a ₹$subtotal subtotal', expected => {
    const cart = { ...buildCart([buildItem({ unitPrice: expected.subtotal, quantity: 1 })]),
      welcomeCouponCode: coupon.code, coupon };
    expect(getCartTotals(cart)).toMatchObject(expected);
    if (expected.shipping) {
      expect(buildWhatsAppCartMessage(cart)).toContain('Indicative shipping: ₹100');
      expect(buildEmailCartBody(cart)).toContain('INDICATIVE SHIPPING : ₹100');
    } else {
      expect(buildWhatsAppCartMessage(cart)).toContain('Free (orders ₹500+ after coupon discounts)');
    }
  });
  it('uses the courier estimate when a coupon removes free-shipping eligibility', () => {
    const cart = { ...buildCart([buildItem({ unitPrice: 500, quantity: 1 })]),
      coupon, deliveryPinCode: '110001',
      deliveryEstimate: { provider: 'shiprocket' as const, currency: 'INR' as const,
        minCharge: 61, maxCharge: 90, minDays: 3, maxDays: 5, weightGrams: 500,
        itemCount: 1, checkedAt: '2026-01-01T00:00:00.000Z' } };
    expect(getCartTotals(cart)).toMatchObject({ discount: 50, shipping: 70, shippingSource: 'estimate', total: 520 });
    expect(getCartTotals({ ...cart, coupon: null })).toMatchObject({ discount: 0, shipping: 0, total: 500 });
  });
  it('applies the capped percentage once the minimum is met', () => {
    const cart = { ...buildCart([buildItem({ unitPrice: 800, quantity: 2 })]), welcomeCouponCode: 'ILOVELUVIA', coupon };
    const totals = getCartTotals(cart);
    expect(totals).toMatchObject({ subtotal: 1600, discount: 100, total: 1500 });
    expect(buildWhatsAppCartMessage(cart)).toContain('Coupon ILOVELUVIA: -₹100');
    expect(buildEmailCartBody(cart)).toContain('Coupon ILOVELUVIA: -₹100');
  });
  it('uses the percentage below the cap and skips carts under the minimum', () => {
    const small = { ...buildCart([buildItem({ unitPrice: 300, quantity: 2 })]), coupon };
    expect(getCartTotals(small)).toMatchObject({ discount: 60, couponShortfall: 0 });
    const tiny = { ...buildCart([buildItem({ unitPrice: 200, quantity: 1 })]), welcomeCouponCode: 'ILOVELUVIA', coupon };
    expect(getCartTotals(tiny)).toMatchObject({ discount: 0, couponShortfall: 300 });
    expect(buildWhatsAppCartMessage(tiny)).toContain('not applied');
  });
});