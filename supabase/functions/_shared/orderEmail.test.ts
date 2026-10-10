// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { buildOrderEmail, sendOrderEmail } from './orderEmail';
import type { EmailOrder } from './orderEmail';
const order: EmailOrder = {
  reference: 'LUV-TEST', status: 'paid', is_live_checkout: true, customer_name: '<Buyer>',
  customer_contact: '+919876543210', customer_email: 'buyer@example.test',
  delivery_details: { addressLine1: '12 Test Street', city: 'Delhi', state: 'Delhi', pincode: '110001' },
  subtotal_paise: 50000, discount_paise: 5000, shipping_paise: 10000, total_paise: 55000,
  payment_order_items: [{ product_name: '<Crochet>', variant_name: 'Red', product_public_slug: 'crochet-flower',
    image_url: 'https://images.luviacreations.com/products/flower.webp', quantity: 1, line_total_paise: 50000 }],
};
afterEach(() => vi.unstubAllGlobals());
it.each(['customer','store'] as const)('sends %s confirmation with totals, address and a stable idempotency key', async audience => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'email-id' }), { status: 200 }));
  vi.stubGlobal('fetch', fetch);
  const recipient = audience === 'store' ? 'orders@luviacreations.com' : 'buyer@example.test';
  expect(await sendOrderEmail({ id: 'job-id', audience, recipient }, order, 'fixture', 'Luvia <orders@example.test>')).toBe('email-id');
  const options = fetch.mock.calls[0][1];
  expect(options.headers['Idempotency-Key']).toBe('order-confirmation-job-id');
  const body = JSON.parse(options.body);
  expect(body.to).toEqual([recipient]);
  expect(body.subject).toContain('LUV-TEST');
  expect(body.text).toContain('Order ID: LUV-TEST');
  expect(body.text).not.toContain('Cart reference');
  expect(body.text).toContain('Total paid: INR 550.00');
  expect(body.text).toContain('12 Test Street, Delhi, Delhi, 110001');
  expect(body.html).toContain('&lt;Crochet&gt;');
  expect(body.html).not.toContain('<Buyer>');
  expect(body.html).toContain('src="https://images.luviacreations.com/products/flower.webp"');
  expect(body.html).toContain('href="https://luviacreations.com/p/crochet-flower/"');
  expect(body.text).toContain('View product: https://luviacreations.com/p/crochet-flower/');
  expect(body.html).toContain('Delivery details');
  expect(body.html).toContain('What happens next?');
  expect(body.html).toContain('background:#fff9ef');
  expect(body.html).toContain('border:1px dashed #bd9856');
});
it('renders every purchased item with its own snapshot and safe product link', () => {
  const { html } = buildOrderEmail({ ...order, payment_order_items: [...order.payment_order_items, {
    product_name: 'Second flower', variant_name: 'White & cream', product_public_slug: 'flower "special"',
    image_url: 'https://images.luviacreations.com/second.jpg?a=1&b=2', quantity: 2, line_total_paise: 100000,
  }] }, 'customer');
  expect(html).toContain('White &amp; cream');
  expect(html).toContain('Quantity: 2');
  expect(html).toContain('second.jpg?a=1&amp;b=2');
  expect(html).toContain('/p/flower%20%22special%22/');
});
it('keeps missing historical media readable without inventing a product link', () => {
  const { html, text } = buildOrderEmail({ ...order, shipping_paise: 0, discount_paise: 0,
    payment_order_items: [{ ...order.payment_order_items[0], image_url: '', product_public_slug: null }],
  }, 'customer');
  expect(html).toContain('&lt;Crochet&gt;');
  expect(html).not.toContain('View product');
  expect(html).not.toContain('Coupon discount');
  expect(text).toContain('Shipping: Free');
});
it('rejects unsafe image URLs before contacting the email provider', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  await expect(sendOrderEmail({ id: 'job', audience: 'customer', recipient: 'buyer@example.test' },
    { ...order, payment_order_items: [{ ...order.payment_order_items[0], image_url: 'javascript:alert(1)' }] },
    'fixture', 'sender')).rejects.toThrow('public HTTPS');
  expect(fetch).not.toHaveBeenCalled();
});
it('does not notify unpaid, review-required or test orders', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  for (const change of [{ status: 'link_created' }, { status: 'review_required' }, { is_live_checkout: false }]) {
    await expect(sendOrderEmail({ id: 'job', audience: 'customer', recipient: 'buyer@example.test' },
      { ...order, ...change }, 'fixture', 'sender')).rejects.toThrow('Only confirmed live orders');
  }
  expect(fetch).not.toHaveBeenCalled();
});
it('surfaces provider rejection and malformed acceptance', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 429 }));
  vi.stubGlobal('fetch', fetch);
  const job = { id: 'job', audience: 'store' as const, recipient: 'orders@luviacreations.com' };
  await expect(sendOrderEmail(job, order, 'fixture', 'sender')).rejects.toThrow('HTTP 429');
  fetch.mockResolvedValue(new Response('{}'));
  await expect(sendOrderEmail(job, order, 'fixture', 'sender')).rejects.toThrow('Invalid order email');
});
