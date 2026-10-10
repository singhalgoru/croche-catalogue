import { expect, test } from '@playwright/test';
import { installMockSupabase } from './mockSupabase';

test.beforeEach(async ({ page }) => {
  await installMockSupabase(page);
  await page.route('https://checkout.razorpay.com/v1/checkout.js', route => route.fulfill({
    contentType: 'application/javascript',
    body: `window.Razorpay = class {
      constructor(options) { this.options = options; }
      on(event, callback) { this.failed = callback; }
      open() {
        const modal = document.createElement('div');
        modal.style.cssText = 'position:fixed;inset:0;background:white;z-index:999999;padding:30px';
        const button = (text, callback) => {
          const node = document.createElement('button'); node.textContent = text;
          node.onclick = callback; modal.appendChild(node);
        };
        button('Mock test success', () => {
          modal.remove();
          this.options.handler({razorpay_order_id:this.options.order_id,razorpay_payment_id:'pay_fixture',razorpay_signature:'fixture'});
        });
        button('Mock test failure', () => this.failed({error:{description:'Test card declined'}}));
        button('Close mock checkout', () => { modal.remove(); this.options.modal.ondismiss(); });
        document.body.appendChild(modal);
      }
    };`,
  }));
  await page.route('**/functions/v1/create-order', async route => {
    const body = route.request().postDataJSON();
    expect(body.amount).toBeUndefined();
    expect(body.customerName).toBe('Test Buyer');
    await route.fulfill({ json: { order_id: 'order_fixture', amount: 25000, currency: 'INR',
      key_id: 'rzp_test_fixture', test_mode: true, reference: 'TEST-123' } });
  });
  await page.goto('./');
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain('https://cdn.razorpay.com');
  expect(csp).toContain('https://lumberjack.razorpay.com');
  await page.getByRole('article', { name: 'Product: Rose Charm' })
    .getByRole('button', { name: 'Add to cart — Rose Charm' }).click();
  await page.getByRole('button', { name: 'Open cart with 1 item', exact: true }).click();
  await page.getByRole('region', { name: 'Razorpay test checkout' }).getByLabel('Name', { exact: true }).fill('Test Buyer');
  await page.getByLabel('Indian mobile number').fill('9876543210');
  await page.getByRole('button', { name: 'Try Razorpay test checkout' }).click();
  await expect(page.getByRole('button', { name: 'Mock test success' })).toBeVisible();
});

test('supports failure and cancellation without placing an order', async ({ page }) => {
  await page.getByRole('button', { name: 'Mock test failure' }).click();
  await page.getByRole('button', { name: 'Close mock checkout' }).click();
  await expect(page.getByText('Test checkout closed. No order was placed.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try Razorpay test checkout' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Open cart with 1 item', exact: true })).toBeVisible();
});

test('retains pending verification after reload and verifies without paying twice', async ({ page }) => {
  let attempts = 0;
  await page.route('**/functions/v1/verify-payment', async route => {
    expect(route.request().postDataJSON()).toEqual({
      razorpay_order_id: 'order_fixture', razorpay_payment_id: 'pay_fixture', razorpay_signature: 'fixture',
    });
    attempts++;
    await route.fulfill(attempts === 1
      ? { status: 409, json: { error: 'Retry verification; do not pay again.' } }
      : { json: { success: true, test_mode: true, payment_id: 'pay_fixture' } });
  });
  await page.getByRole('button', { name: 'Mock test success' }).click();
  await expect(page.getByRole('button', { name: 'Retry payment verification' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Open cart with 1 item', exact: true }).click();
  await page.getByRole('button', { name: 'Retry payment verification' }).click();
  await expect(page.getByText(/Test payment verified/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try Razorpay test checkout' })).toHaveCount(0);
  expect(attempts).toBe(2);
});
