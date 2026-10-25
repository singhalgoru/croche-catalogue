import { expect, test } from '@playwright/test';
import { installMockSupabase } from './mockSupabase';

for (const scenario of ['success', 'closed', 'failed', 'blocked', 'remote']) {
const replace = scenario !== 'success' && scenario !== 'remote';
test(scenario === 'remote' ? 'restores the same payment request without browser recovery on another device'
  : scenario === 'blocked' ? 'shows safe support instead of paying again when an earlier payment blocks checkout'
  : `reviews address and ${replace ? `resumes ${scenario} payment after a cart change` : 'pays online'} before showing a verified order confirmation`, async ({ page }) => {
  const events: { channel: string; args: unknown[] }[] = [];
  await page.exposeFunction('recordAnalytics', (channel: string, args: unknown[]) => { events.push({ channel, args }); });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'userAgent', { get: () => 'Analytics regression browser' });
    Object.defineProperty(navigator, 'userAgentData', { get: () => undefined });
    const target = window as Window & { recordAnalytics: (channel: string, args: unknown[]) => Promise<void> };
    target.gtag = (...args: unknown[]) => { void target.recordAnalytics('ga', args); };
    target.fbq = Object.assign((...args: unknown[]) => { void target.recordAnalytics('meta', args); }, { queue: [] as unknown[][] });
  });
  const state = await installMockSupabase(page);
  const expectPinnedAction = async (name: string) => {
    const action = page.getByRole('button', { name, exact: true });
    if (page.viewportSize()!.width >= 640) return;
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(action).toBeInViewport({ ratio: 1 });
    const before = (await action.boundingBox())!;
    const footer = action.locator('..');
    expect(await footer.evaluate(node => getComputedStyle(node).position)).toBe('fixed');
    const navigation = page.getByRole('navigation', { name: 'Mobile navigation', exact: true });
    if (await navigation.count()) {
      expect(before.y + before.height).toBeLessThanOrEqual((await navigation.boundingBox())!.y);
    } else {
      expect(before.y + before.height).toBeGreaterThan(page.viewportSize()!.height - 32);
    }
    await page.getByRole('contentinfo').scrollIntoViewIfNeeded();
    await expect(action).toBeInViewport({ ratio: 1 });
    expect(Math.abs((await action.boundingBox())!.y - before.y)).toBeLessThan(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width);
  };
  await page.route('**/rest/v1/checkout_settings*', route => route.fulfill({ json: { id: true, live_enabled: true } }));
  await page.route('**/rest/v1/rpc/save_cart_delivery_details', async route => {
    const body = route.request().postDataJSON();
    const cart = state.carts.find(cart => cart.id === body.target_cart_id);
    if (!cart) throw new Error('Missing cart');
    Object.assign(cart, { cart_delivery_details: { details: body.delivery, welcome_coupons: null } });
    await route.fulfill({ json: body.delivery });
  });
  const requests: { requestKey: string; previousRequestKey?: string }[] = [];
  let paid = false;
  let purchaseReads = 0;
  await page.route('**/rest/v1/rpc/get_live_purchase_analytics', route => {
    purchaseReads++;
    return route.fulfill({ json: paid ? {
      transaction_id: 'LUV-LIVEFIXTURE', currency: 'INR',
      value: replace ? 698 : 349, shipping: replace ? 0 : 100, total: replace ? 698 : 449,
      items: [{ item_id: 'rose-charm', item_name: 'Rose Charm', item_variant: 'Rose Pink',
        variant_id: 'rose-pink', price: 349, quantity: replace ? 2 : 1 }],
    } : null });
  });
  await page.route('**/rest/v1/rpc/get_live_checkout_status', route => route.fulfill({
    json: paid ? { status: 'paid', reference: 'LUV-LIVEFIXTURE' }
      : replace && requests.length ? { status: 'link_created', reference: 'LUV-LIVEFIXTURE' } : null,
  }));
  await page.route('**/rest/v1/rpc/get_live_checkout_recovery', route => route.fulfill({
    json: scenario === 'remote' && requests.length && !paid ? {
      requestKey: requests[0].requestKey, status: 'link_created', reference: 'LUV-LIVEFIXTURE', cartMatches: true,
    } : null,
  }));
  await page.route('**/functions/v1/create-live-order', route => {
    requests.push(route.request().postDataJSON());
    if (scenario === 'blocked') return route.fulfill({ status: 400, json: {
      error: 'This cart has a pending payment. Resume it or contact Luvia before paying again.',
    } });
    return route.fulfill({ json: {
    order_id: 'order_livefixture', amount: requests.length > 1 ? 69800 : 44900, currency: 'INR', key_id: 'rzp_live_fixture',
    test_mode: false, reference: 'LUV-LIVEFIXTURE',
  } });
  });
  await page.route('**/functions/v1/verify-live-payment', route => {
    paid = true;
    return route.fulfill({ json: {
    success: true, test_mode: false, payment_id: 'pay_livefixture', reference: 'LUV-LIVEFIXTURE',
    } });
  });
  await page.route('https://checkout.razorpay.com/v1/checkout.js', route => route.fulfill({
    contentType: 'application/javascript', body: `window.Razorpay = class {
      constructor(options) { this.options = options; }
      on(event, callback) { this.failed = callback; }
      open() {
        window.checkoutOpens = (window.checkoutOpens || 0) + 1;
        if (${replace || scenario === 'remote'} && window.checkoutOpens === 1) {
          if (${scenario === 'failed'}) this.failed({error:{description:'Card declined'}});
          this.options.modal.ondismiss(); return;
        }
        this.options.handler({ razorpay_order_id: 'order_livefixture', razorpay_payment_id: 'pay_livefixture', razorpay_signature: 'fixture' });
      }
    };`,
  }));
  await page.goto('./');
  await page.getByRole('button', { name: 'View Rose Charm', exact: true }).click();
  await expect(page).toHaveURL(/\/p\/rose-charm\/$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Add to cart — Rose Charm', exact: true }).click();
  await page.getByRole('button', { name: 'Open cart with 1 item', exact: true }).click();
  const pay = page.getByRole('button', { name: /^(Proceed to payment|Resume secure payment)$/ });
  await expect(page.getByRole('navigation', { name: 'Checkout steps' })).toBeVisible();
  await expect(pay).toHaveCount(0);
  await expect(page.getByLabel('Checkout total', { exact: true })).toContainText('Estimated total: ₹449');
  await expectPinnedAction('Continue with delivery details');
  await page.getByRole('main').getByRole('button', { name: 'Rose Charm', exact: true }).click();
  await expect(page).toHaveURL(/\/p\/rose-charm\/\?variant=rose-pink/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('link', { name: 'Back to cart' }).click();
  await expect(page).toHaveURL(/checkout=cart/);
  await page.getByRole('button', { name: 'Continue with delivery details' }).click();
  await expect(page.getByRole('navigation', { name: 'Checkout steps' }).getByRole('button', { name: '2. Delivery' })).toHaveAttribute('aria-current', 'step');
  await expect(page.getByRole('heading', { name: 'Delivery details', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/checkout=delivery/);
  await page.goBack();
  await expect(page).toHaveURL(/checkout=cart/);
  await page.goForward();
  await expect(page).toHaveURL(/checkout=delivery/);
  await page.getByLabel('Recipient name').fill('Live Buyer');
  await page.getByLabel('Mobile number', { exact: true }).fill('9876543210');
  await page.getByLabel('Contact email', { exact: true }).fill('buyer@example.test');
  await expectPinnedAction('Continue to address');
  await page.getByRole('button', { name: 'Continue to address' }).click();
  await page.getByLabel('House / building and street').fill('12 Live Street');
  await page.getByLabel('City', { exact: true }).fill('Delhi');
  await page.getByLabel('State', { exact: true }).fill('Delhi');
  await page.getByRole('region', { name: 'Order details' }).getByLabel('Pincode', { exact: true }).fill('110001');
  await expectPinnedAction('Save and review');
  await page.getByRole('button', { name: 'Save and review' }).click();
  await expect(page.getByText('3. Review order', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply coupon', exact: true })).toBeVisible();
  await expect(pay).toBeEnabled();
  await expect(page.getByLabel('Checkout total', { exact: true })).toContainText('Total: ₹449');
  await expectPinnedAction('Proceed to payment');
  expect(events.filter(event => event.args[1] === 'purchase')).toHaveLength(0);
  await page.getByRole('button', { name: 'Edit details', exact: true }).click();
  await expect(page).toHaveURL(/checkout=delivery/);
  await expect(pay).toHaveCount(0);
  await expect(page.getByLabel('Recipient name')).toHaveValue('Live Buyer');
  await page.getByRole('button', { name: 'Continue to address' }).click();
  await page.getByRole('button', { name: 'Save and review' }).click();
  await expect(pay).toBeEnabled();
  await expect(page.getByRole('link', { name: 'Send cart to Luvia on WhatsApp' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Need help? Contact Luvia on WhatsApp' })).toBeVisible();
  await pay.click();
  if (scenario === 'remote') {
    await expect(page.getByRole('button', { name: 'Resume secure payment' })).toBeEnabled();
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await expect(page.getByRole('button', { name: 'Resume secure payment' })).toBeEnabled();
    await page.evaluate(() => { Object.assign(window, { checkoutOpens: 1 }); });
    await page.getByRole('button', { name: 'Resume secure payment' }).click();
    await expect(page.getByRole('heading', { name: 'Thank you! Your order is confirmed.' })).toBeVisible();
    expect(requests).toHaveLength(2);
    expect(requests[1].requestKey).toBe(requests[0].requestKey);
    expect(requests[1].previousRequestKey).toBeUndefined();
    return;
  }
  if (scenario === 'blocked') {
    await expect(page.getByRole('heading', { name: 'An earlier payment needs checking.' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Get payment help on WhatsApp' })).toBeVisible();
    await expect(pay).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Secure online checkout' }).getByRole('status'))
      .toContainText('We cannot safely start another payment');
    expect(requests).toHaveLength(1);
    return;
  }
  if (replace) {
    const recovery = page.getByRole('region', { name: 'Secure online checkout' });
    await expect(recovery.getByRole('status')).toContainText(scenario === 'failed' ? 'Card declined' : 'Payment confirmation has not arrived yet');
    await expect(page.getByRole('heading', { name: scenario === 'failed'
      ? "Payment didn't go through. Let's get you back on track." : 'Waiting for your payment confirmation.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Resume secure payment' })).toBeEnabled();
    await expectPinnedAction('Resume secure payment');
    await expect(page.getByText(scenario === 'failed' ? 'Payment incomplete' : 'Awaiting payment confirmation', { exact: true })).toBeVisible();
    if (scenario === 'failed') await expect(page.getByText('Your handmade favourites are one step away. Complete your payment to make them yours.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Get payment help on WhatsApp' })).toBeVisible();
    await page.getByRole('button', { name: /Increase quantity of Rose Charm/ }).click();
    await expect(page.getByRole('button', { name: /Increase quantity of Rose Charm/ })).toBeEnabled();
    await expect(page.getByLabel('Cart order actions').getByText('₹698', { exact: true })).toBeVisible();
    await pay.click();
    await expect.poll(() => requests.length).toBe(2);
    expect(requests[1].previousRequestKey).toBe(requests[0].requestKey);
    expect(requests[1].requestKey).not.toBe(requests[0].requestKey);
  }
  await expect(page.getByRole('region', { name: 'Secure online checkout' }).getByRole('status')).toContainText('Order confirmed — LUV-LIVEFIXTURE');
  await expect(page).toHaveURL(/checkout=confirmation/);
  await expect.poll(() => events.filter(event => event.args[1] === 'purchase').length).toBe(1);
  await expect.poll(() => events.filter(event => event.args[1] === 'Purchase').length).toBe(1);
  const readsBeforeReload = purchaseReads;
  await expect(pay).toHaveCount(0);
  const originalCartId = state.carts[0].id;
  state.carts.splice(0);
  await page.reload();
  await expect(page.getByRole('region', { name: 'Secure online checkout' }).getByRole('status')).toContainText('Order confirmed — LUV-LIVEFIXTURE');
  await expect.poll(() => purchaseReads).toBeGreaterThan(readsBeforeReload);
  expect(events.filter(event => event.args[1] === 'purchase')).toHaveLength(1);
  expect(events.filter(event => event.args[1] === 'Purchase')).toHaveLength(1);
  const names = events.filter(event => event.channel === 'ga').map(event => event.args[1]);
  for (const name of ['view_item', 'add_to_cart', 'view_cart', 'begin_checkout', 'add_shipping_info', 'add_payment_info', 'purchase']) {
    expect(names).toContain(name);
  }
  const serialized = JSON.stringify(events);
  for (const privateValue of ['Live Buyer', 'buyer@example.test', '9876543210', '12 Live Street', 'razorpay_signature', 'checkoutRequest']) {
    expect(serialized).not.toContain(privateValue);
  }
  await expect(pay).toHaveCount(0);
  await expect(page.getByLabel('Cart order actions').getByText('₹0', { exact: true })).not.toBeVisible();
  expect(state.carts.every(cart => cart.id !== originalCartId)).toBe(true);
  expect(requests.length).toBe(replace ? 2 : 1);
});
}
