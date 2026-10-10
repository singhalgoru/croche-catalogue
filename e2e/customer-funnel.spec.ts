import { expect, test } from '@playwright/test';
import { installMockSupabase } from './mockSupabase';

test('cart prioritizes products and keeps order actions compact on short screens', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 600 });
  await installMockSupabase(page);
  await page.goto('./');
  await page.getByRole('article', { name: 'Product: Rose Charm' })
    .getByRole('button', { name: 'Add to cart — Rose Charm' }).click();
  await page.getByRole('button', { name: 'Open cart with 1 item', exact: true }).click();
  const cart = page.getByRole('dialog', { name: 'Shopping cart' });
  const item = cart.getByRole('article', { name: /View Rose Charm/ });
  const actions = cart.locator('[aria-label="Cart order actions"]');
  await expect(item).toBeInViewport({ ratio: 1 });
  const itemBox = (await item.boundingBox())!;
  const actionsBox = (await actions.boundingBox())!;
  expect(actionsBox.height).toBeLessThanOrEqual(150);
  expect(itemBox.y + itemBox.height).toBeLessThanOrEqual(actionsBox.y);
  for (const name of ['Send cart to Luvia on WhatsApp', /Email cart to Luvia/]) {
    const link = cart.getByRole('link', { name });
    await expect(link).toBeInViewport({ ratio: 1 });
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await expect(cart.getByText('Items subtotal', { exact: true })).not.toBeVisible();
  await cart.getByText('Price breakdown', { exact: true }).click();
  await expect(cart.getByText('Items subtotal', { exact: true })).toBeVisible();
  await expect(cart.getByText(/final delivery charge will be confirmed/)).toBeVisible();
  await cart.getByText('Price breakdown', { exact: true }).click();
  const pinBox = (await cart.getByLabel('Delivery pincode (optional)').boundingBox())!;
  expect(pinBox.y).toBeGreaterThan(itemBox.y + itemBox.height);
});

test('guest address is saved, reviewed, shared and restored without showing payment', async ({ page }) => {
  const state = await installMockSupabase(page);
  await page.route('**/rest/v1/welcome_offer*', route => route.fulfill({ json: {
    id: true, enabled: false, percent: 10, max_discount_rupees: 100, minimum_subtotal_rupees: 500, valid_days: 30,
  } }));
  await page.route('**/rest/v1/rpc/save_cart_delivery_details', async route => {
    const body = route.request().postDataJSON();
    const cart = state.carts.find(cart => cart.id === body.target_cart_id);
    expect(cart).toBeDefined();
    if (cart) Object.assign(cart, { cart_delivery_details: { details: body.delivery, welcome_coupons: null } });
    await route.fulfill({ json: body.delivery });
  });
  await page.goto('./');
  await page.getByRole('article', { name: 'Product: Rose Charm' })
    .getByRole('button', { name: 'Add to cart — Rose Charm' }).click();
  await page.getByRole('button', { name: 'Open cart with 1 item', exact: true }).click();
  await page.getByRole('button', { name: 'Continue with delivery details' }).click();
  await page.getByLabel('Recipient name').fill('Guest Buyer');
  await page.getByLabel('Mobile number', { exact: true }).fill('9876543210');
  await page.getByRole('button', { name: 'Continue to address' }).click();
  await page.getByLabel('House / building and street').fill('12 Guest Street');
  await page.getByLabel('City', { exact: true }).fill('New Delhi');
  await page.getByLabel('State', { exact: true }).fill('Delhi');
  await page.getByRole('region', { name: 'Order details' }).getByLabel('Pincode', { exact: true }).fill('110001');
  await page.getByRole('button', { name: 'Save and review' }).click();
  await expect(page.getByText('3. Review order request', { exact: true })).toBeVisible();
  await expect(page.getByText(/12 Guest Street/)).toBeVisible();
  const whatsapp = await page.getByRole('link', { name: 'Send cart to Luvia on WhatsApp' }).getAttribute('href');
  expect(decodeURIComponent(whatsapp!)).toContain('12 Guest Street');
  await expect(page.getByRole('button', { name: 'Try Razorpay test checkout' })).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'Open cart with 1 item', exact: true }).click();
  await page.getByRole('button', { name: 'Review delivery details' }).click();
  await expect(page.getByText(/12 Guest Street/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Email my welcome coupon' })).toHaveCount(0);
});

test('customer signup verifies the same cart owner and reports sign-in delivery errors', async ({ page }) => {
  const state = await installMockSupabase(page);
  await page.route('**/rest/v1/welcome_offer*', route => route.fulfill({ json: {
    id: true, enabled: false, percent: 10, max_discount_rupees: 100, minimum_subtotal_rupees: 500, valid_days: 30,
  } }));
  await page.route('**/rest/v1/rpc/save_cart_delivery_details', async route => {
    const body = route.request().postDataJSON();
    const cart = state.carts.find(cart => cart.id === body.target_cart_id);
    if (!cart) throw new Error('Missing customer cart');
    Object.assign(cart, { cart_delivery_details: { details: body.delivery, welcome_coupons: null } });
    await route.fulfill({ json: body.delivery });
  });
  await page.goto('./');
  await page.getByRole('article', { name: 'Product: Rose Charm' })
    .getByRole('button', { name: 'Add to cart — Rose Charm' }).click();
  await page.getByRole('button', { name: 'Open cart with 1 item', exact: true }).click();
  const originalOwner = state.carts[0].user_id;
  const originalCart = state.carts[0].id;
  await page.getByRole('button', { name: 'Continue with delivery details' }).click();
  await page.getByLabel('Recipient name').fill('Customer Buyer');
  await page.getByLabel('Mobile number', { exact: true }).fill('9876543210');
  await page.getByLabel('Contact email (optional)').fill('buyer@example.test');
  await page.getByRole('button', { name: 'Continue to address' }).click();
  await page.getByLabel('House / building and street').fill('12 Customer Street');
  await page.getByLabel('City', { exact: true }).fill('New Delhi');
  await page.getByLabel('State', { exact: true }).fill('Delhi');
  await page.getByRole('region', { name: 'Order details' }).getByLabel('Pincode', { exact: true }).fill('110001');
  await page.getByRole('button', { name: 'Save and review' }).click();
  await page.getByRole('button', { name: 'Send signup email' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Signup verification requested' })).toBeVisible();
  await page.getByLabel('Email verification code').fill('000000');
  await page.getByRole('button', { name: 'Verify email', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('invalid verification code');
  await page.getByLabel('Email verification code').fill('123456');
  await page.getByRole('button', { name: 'Verify email', exact: true }).click();
  await expect(page.getByText('Verified email: buyer@example.test')).toBeVisible();
  expect(state.carts[0].id).toBe(originalCart);
  expect(state.carts[0].user_id).toBe(originalOwner);
  await expect(page.getByRole('dialog', { name: 'Shopping cart' }).getByRole('article', { name: /View Rose Charm/ })).toHaveCount(1);
  await page.reload();
  await page.getByRole('button', { name: 'Open cart with 1 item', exact: true }).click();
  await page.getByRole('button', { name: 'Review delivery details' }).click();
  await expect(page.getByText('Verified email: buyer@example.test')).toBeVisible();
  const whatsapp = await page.getByRole('link', { name: 'Send cart to Luvia on WhatsApp' }).getAttribute('href');
  expect(decodeURIComponent(whatsapp!)).toContain('12 Customer Street');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByText('Your cart is empty', { exact: true })).toBeVisible();
  const account = page.getByRole('region', { name: 'Customer account' });
  await expect(account.getByRole('button', { name: 'Create account', exact: true })).toBeVisible();
  await expect(account.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
});
