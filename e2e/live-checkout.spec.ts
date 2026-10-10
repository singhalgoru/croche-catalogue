import { expect, test } from '@playwright/test';
import { installMockSupabase } from './mockSupabase';

for (const replace of [false, true]) {
test(`reviews address and ${replace ? 'updates an unpaid checkout after a cart change' : 'pays online'} before showing a verified order confirmation`, async ({ page }) => {
  const state = await installMockSupabase(page);
  await page.route('**/rest/v1/checkout_settings*', route => route.fulfill({ json: { id: true, live_enabled: true } }));
  await page.route('**/rest/v1/rpc/save_cart_delivery_details', async route => {
    const body = route.request().postDataJSON();
    const cart = state.carts.find(cart => cart.id === body.target_cart_id);
    if (!cart) throw new Error('Missing cart');
    Object.assign(cart, { cart_delivery_details: { details: body.delivery, welcome_coupons: null } });
    await route.fulfill({ json: body.delivery });
  });
  const requests: { requestKey: string; previousRequestKey?: string }[] = [];
  await page.route('**/rest/v1/rpc/get_live_checkout_status', route => route.fulfill({
    json: replace && requests.length ? { status: 'link_created', reference: 'LUV-LIVEFIXTURE' } : null,
  }));
  await page.route('**/functions/v1/create-live-order', route => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ json: {
    order_id: 'order_livefixture', amount: requests.length > 1 ? 69800 : 44900, currency: 'INR', key_id: 'rzp_live_fixture',
    test_mode: false, reference: 'LUV-LIVEFIXTURE',
  } });
  });
  await page.route('**/functions/v1/verify-live-payment', route => route.fulfill({ json: {
    success: true, test_mode: false, payment_id: 'pay_livefixture', reference: 'LUV-LIVEFIXTURE',
  } }));
  await page.route('https://checkout.razorpay.com/v1/checkout.js', route => route.fulfill({
    contentType: 'application/javascript', body: `window.Razorpay = class {
      constructor(options) { this.options = options; }
      on() {}
      open() {
        window.checkoutOpens = (window.checkoutOpens || 0) + 1;
        if (${replace} && window.checkoutOpens === 1) { this.options.modal.ondismiss(); return; }
        this.options.handler({ razorpay_order_id: 'order_livefixture', razorpay_payment_id: 'pay_livefixture', razorpay_signature: 'fixture' });
      }
    };`,
  }));
  await page.goto('./');
  await page.getByRole('article', { name: 'Product: Rose Charm' }).getByRole('button', { name: 'Add to cart — Rose Charm' }).click();
  await page.getByRole('button', { name: 'Open cart with 1 item', exact: true }).click();
  const pay = page.getByRole('button', { name: 'Proceed to payment' });
  await expect(pay).toBeDisabled();
  await page.getByRole('button', { name: 'Continue with delivery details' }).click();
  await page.getByLabel('Recipient name').fill('Live Buyer');
  await page.getByLabel('Mobile number', { exact: true }).fill('9876543210');
  await page.getByLabel('Contact email', { exact: true }).fill('buyer@example.test');
  await page.getByRole('button', { name: 'Continue to address' }).click();
  await page.getByLabel('House / building and street').fill('12 Live Street');
  await page.getByLabel('City', { exact: true }).fill('Delhi');
  await page.getByLabel('State', { exact: true }).fill('Delhi');
  await page.getByRole('region', { name: 'Order details' }).getByLabel('Pincode', { exact: true }).fill('110001');
  await page.getByRole('button', { name: 'Save and review' }).click();
  await expect(page.getByText('3. Review order', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply coupon', exact: true })).toBeVisible();
  await expect(pay).toBeEnabled();
  await expect(page.getByRole('link', { name: 'Send cart to Luvia on WhatsApp' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Need help? Contact Luvia on WhatsApp' })).toBeVisible();
  await pay.click();
  if (replace) {
    await expect(page.getByRole('region', { name: 'Secure online checkout' }).getByRole('status')).toContainText('Payment window closed');
    await page.getByRole('button', { name: /Increase quantity of Rose Charm/ }).click();
    await expect(page.getByRole('button', { name: /Increase quantity of Rose Charm/ })).toBeEnabled();
    await expect(page.getByLabel('Cart order actions').getByText('₹698', { exact: true })).toBeVisible();
    await pay.click();
    await expect.poll(() => requests.length).toBe(2);
    expect(requests[1].previousRequestKey).toBe(requests[0].requestKey);
    expect(requests[1].requestKey).not.toBe(requests[0].requestKey);
  }
  await expect(page.getByRole('region', { name: 'Secure online checkout' }).getByRole('status')).toContainText('Order confirmed — LUV-LIVEFIXTURE');
  await expect(pay).toHaveCount(0);
});
}
