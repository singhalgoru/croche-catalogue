// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { sendOrderEmail } from './orderEmail';
import type { EmailOrder } from './orderEmail';
const order: EmailOrder = {
  reference: 'LUV-TEST', status: 'paid', is_live_checkout: true, customer_name: '<Buyer>',
  customer_contact: '+919876543210', customer_email: 'buyer@example.test',
  delivery_details: { addressLine1: '12 Test Street', city: 'Delhi', state: 'Delhi', pincode: '110001' },
  subtotal_paise: 50000, discount_paise: 5000, shipping_paise: 10000, total_paise: 55000,
  payment_order_items: [{ product_name: '<Crochet>', variant_name: 'Red', quantity: 1, line_total_paise: 50000 }],
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
