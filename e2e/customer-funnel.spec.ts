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
  const checkoutAccount = page.getByRole('region', { name: 'Checkout account' });
  await expect(checkoutAccount.getByText(/Guest orders do not receive account-only welcome rewards/)).toBeVisible();
  await checkoutAccount.getByRole('button', { name: 'Continue as guest' }).click();
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

test('checkout signup with password activates the same cart owner, shows the name in the header and signs back in', async ({ page }) => {
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
  await expect(page.getByRole('button', { name: 'Sign in or create account' })).toBeVisible();
  await page.getByRole('article', { name: 'Product: Rose Charm' })
    .getByRole('button', { name: 'Add to cart — Rose Charm' }).click();
  await page.getByRole('button', { name: 'Open cart with 1 item', exact: true }).click();
  const originalOwner = state.carts[0].user_id;
  const originalCart = state.carts[0].id;
  await page.getByRole('button', { name: 'Continue with delivery details' }).click();
  const signup = page.getByRole('form', { name: 'Customer signup' });
  await signup.getByLabel('Full name').fill('Customer Buyer');
  await signup.getByLabel('Mobile number').fill('9876543210');
  await signup.getByLabel('House / building and street').fill('12 Customer Street');
  await signup.getByLabel('City', { exact: true }).fill('New Delhi');
  await signup.getByLabel('State', { exact: true }).fill('Delhi');
  await signup.getByLabel('Pincode', { exact: true }).fill('110001');
  await signup.getByLabel('Account email').fill('buyer@example.test');
  await signup.getByLabel('Password', { exact: true }).fill('Crochet2026');
  await signup.getByLabel('Confirm password').fill('Crochet2027');
  await signup.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('alert')).toContainText('Passwords do not match');
  await signup.getByLabel('Confirm password').fill('Crochet2026');
  await signup.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Signup verification requested' })).toBeVisible();
  await page.getByLabel('Email verification code').fill('000000');
  await page.getByRole('button', { name: 'Verify email', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('invalid verification code');
  await page.getByLabel('Email verification code').fill('123456');
  await page.getByRole('button', { name: 'Verify email', exact: true }).click();
  await expect(page.getByText('Verified email: buyer@example.test')).toBeVisible();
  await expect(page.getByText('Welcome, Customer Buyer!')).toBeVisible();
  expect(state.carts[0].id).toBe(originalCart);
  expect(state.carts[0].user_id).toBe(originalOwner);
  await page.getByRole('button', { name: 'Continue to delivery details' }).click();
  await expect(page.getByLabel('Recipient name')).toHaveValue('Customer Buyer');
  await page.getByRole('button', { name: 'Continue to address' }).click();
  await expect(page.getByLabel('House / building and street')).toHaveValue('12 Customer Street');
  await page.getByRole('button', { name: 'Save and review' }).click();
  await expect(page.getByText('3. Review order request', { exact: true })).toBeVisible();
  const whatsapp = await page.getByRole('link', { name: 'Send cart to Luvia on WhatsApp' }).getAttribute('href');
  expect(decodeURIComponent(whatsapp!)).toContain('12 Customer Street');
  await page.getByRole('button', { name: 'Close cart' }).click();
  await expect(page.getByRole('button', { name: 'My account, signed in as Customer' })).toBeVisible();

  await page.getByRole('button', { name: 'My account, signed in as Customer' }).click();
  await expect(page.getByRole('dialog', { name: 'Hi, Customer' })).toBeVisible();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Signed out');
  await dialog.getByRole('button', { name: 'Close account' }).click();
  await expect(page.getByRole('button', { name: 'Sign in or create account' })).toBeVisible();

  await page.getByRole('button', { name: 'Sign in or create account' }).click();
  const signIn = page.getByRole('dialog', { name: 'Sign in to Luvia' }).getByRole('form', { name: 'Customer sign in' });
  await signIn.getByLabel('Account email').fill('buyer@example.test');
  await signIn.getByLabel('Password', { exact: true }).fill('wrong-password1');
  await signIn.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Email or password is incorrect');
  await signIn.getByLabel('Password', { exact: true }).fill('Crochet2026');
  await signIn.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'My account, signed in as Customer' })).toBeVisible();
});

test('header account options open sign in and signup on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await installMockSupabase(page);
  await page.goto('./');
  const account = page.getByRole('button', { name: 'Sign in or create account' });
  const menu = page.getByRole('button', { name: 'Open navigation' });
  await expect(account).toBeInViewport({ ratio: 1 });
  const accountBox = (await account.boundingBox())!;
  const menuBox = (await menu.boundingBox())!;
  expect(accountBox.x + accountBox.width).toBeLessThanOrEqual(menuBox.x);
  await menu.click();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Create account' }).click();
  const dialog = page.getByRole('dialog', { name: 'Create your Luvia account' });
  await expect(dialog.getByLabel('Confirm password')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});