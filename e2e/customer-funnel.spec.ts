import { expect, test } from '@playwright/test';
import { installMockSupabase } from './mockSupabase';

test('guest checkout prominently offers signup without leaving the current checkout step', async ({ page }) => {
  await installMockSupabase(page);
  await page.route('**/rest/v1/welcome_offer*', route => route.fulfill({ json: {
    id: true, enabled: true, percent: 10, max_discount_rupees: 100, minimum_subtotal_rupees: 500, valid_days: 30,
  } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Add to cart — Rose Charm', exact: true }).click();
  await page.getByRole('button', { name: 'Open cart with 1 item', exact: true }).click();
  const banner = page.getByRole('region', { name: 'Welcome discount' });
  await expect(banner).toContainText('additional 10% off your first order');
  await expect(banner).toContainText('Up to ₹100 off on items worth ₹500');
  await expect(banner).toContainText('Guest checkout remains available');
  await banner.getByRole('button', { name: 'Create account & save', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Create your Luvia account' })).toBeVisible();
  await expect(page).toHaveURL(/checkout=cart/);
  await page.getByRole('button', { name: 'Close account', exact: true }).click();
  await page.getByRole('button', { name: 'Continue with delivery details' }).click();
  await expect(banner).toBeVisible();
  await expect(page).toHaveURL(/checkout=delivery/);
  await expect(page.getByLabel('Recipient name')).toBeVisible();
});

test('home footer ends with themed payment methods and Luvia copyright', async ({ page }) => {
  await installMockSupabase(page);
  await page.goto('./');
  const footer = page.getByRole('contentinfo');
  const methods = footer.getByRole('region', { name: 'Payment methods' });
  await methods.scrollIntoViewIfNeeded();
  for (const name of ['UPI', 'Visa', 'Mastercard', 'RuPay']) {
    const image = methods.getByRole('img', { name, exact: true });
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate(node => node instanceof HTMLImageElement && node.complete && node.naturalWidth > 0)).toBe(true);
  }
  await expect(methods.getByText('Wallet', { exact: true })).toBeVisible();
  await expect(footer.locator('> div > p').last()).toContainText(`© ${new Date().getFullYear()} Luvia Creations.`);
  const methodsBox = (await methods.boundingBox())!;
  const contactsBox = (await footer.getByRole('link', { name: 'hello@luviacreations.com' }).boundingBox())!;
  expect(methodsBox.y).toBeGreaterThanOrEqual(contactsBox.y + contactsBox.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width);
});

test('cart uses a full-width page with products before the summary on short screens', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 600 });
  await installMockSupabase(page);
  await page.goto('./');
  await page.getByRole('article', { name: 'Product: Rose Charm' })
    .getByRole('button', { name: 'Add to cart — Rose Charm' }).click();
  await page.getByRole('button', { name: 'Open cart with 1 item', exact: true }).click();
  const cart = page.getByRole('main');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const back = cart.getByRole('button', { name: 'Close cart', exact: true });
  const backBox = (await back.boundingBox())!;
  const iconBox = (await back.locator('svg').boundingBox())!;
  expect(Math.abs((backBox.x + backBox.width / 2) - (iconBox.x + iconBox.width / 2))).toBeLessThan(1);
  expect(Math.abs((backBox.y + backBox.height / 2) - (iconBox.y + iconBox.height / 2))).toBeLessThan(1);
  const item = cart.getByRole('article', { name: /View Rose Charm/ });
  const actions = cart.locator('[aria-label="Cart order actions"]');
  await expect(item).toBeVisible();
  const itemBox = (await item.boundingBox())!;
  const actionsBox = (await actions.boundingBox())!;
  const bannerBox = (await cart.getByRole('region', { name: 'Free delivery' }).boundingBox())!;
  expect(bannerBox.y).toBeGreaterThan(actionsBox.y);
  expect(bannerBox.y + bannerBox.height).toBeLessThanOrEqual(actionsBox.y + actionsBox.height);
  expect(itemBox.y + itemBox.height).toBeLessThanOrEqual(actionsBox.y);
  expect((await cart.boundingBox())!.width).toBe(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await expect(cart.getByRole('button', { name: 'Continue with delivery details' })).toBeVisible();
  await expect(cart.getByRole('link', { name: 'Send cart to Luvia on WhatsApp' })).toBeVisible();
  await expect(cart.getByText('Items subtotal', { exact: true })).toBeVisible();
  await expect(cart.getByText('Save or select your delivery address to calculate shipping. The current shipping amount is an estimate.', { exact: true })).toBeVisible();
  await cart.getByText('Price breakdown', { exact: true }).click();
  await expect(cart.getByText('Items subtotal', { exact: true })).toBeHidden();
  await expect(cart.getByLabel('Delivery pincode (optional)')).toHaveCount(0);
  await expect(cart.getByText(/^Delivery pincode:/)).toHaveCount(0);
  await expect(cart.getByRole('region', { name: 'Free delivery' })).toContainText('Add ₹151 more in items for free delivery!');
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
  await expect(page.getByText(/Guest orders do not receive the one-time welcome reward/)).toBeVisible();
  await expect(page.getByRole('main').getByRole('button', { name: 'Create account' })).toHaveCount(0);
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
  await expect(page).toHaveURL(/checkout=review/);
  await expect(page.getByText(/12 Guest Street/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Email my welcome coupon' })).toHaveCount(0);
  for (const cart of state.carts) {
    Object.assign(cart.cart_delivery_details as object, { welcome_coupons: {
      code: 'ILOVELUVIA', percent: 10, max_discount_rupees: 100000, minimum_subtotal_rupees: 500 } });
  }
  await page.reload();
  await expect(page).toHaveURL(/checkout=review/);
  await expect(page.getByRole('alert')).toContainText('Add ₹151 more in items');
  await expect(page.getByRole('alert')).toContainText('minimum items value of ₹500');
  await expect(page.getByText('Coupon ILOVELUVIA not applied: minimum items value not met.')).toBeVisible();
  for (const cart of state.carts) {
    Object.assign(cart.cart_delivery_details as object, { welcome_coupons: {
      code: 'ILOVELUVIA', percent: 10, max_discount_rupees: 100000, minimum_subtotal_rupees: 0 } });
  }
  await page.reload();
  await expect(page).toHaveURL(/checkout=review/);
  const original = page.getByLabel(/^Original price ₹/);
  const discounted = page.getByLabel(/^Discounted price ₹/);
  await expect(original).toBeVisible();
  await expect(discounted).toBeVisible();
  const amount = async (locator: typeof original) => Number((await locator.textContent())!.replace(/[^\d]/g, ''));
  expect(await amount(discounted)).toBeLessThan(await amount(original));
  expect(await original.evaluate(node => getComputedStyle(node).textDecorationLine)).toContain('line-through');
});

test('charges shipping when the coupon reduces the items subtotal below ₹500', async ({ page }) => {
  const state = await installMockSupabase(page);
  const product = state.products.find(product => product.name === 'Rose Charm');
  if (!product) throw new Error('Missing Rose Charm fixture');
  product.price = 500;
  await page.goto('./');
  await page.getByRole('article', { name: 'Product: Rose Charm' })
    .getByRole('button', { name: 'Add to cart — Rose Charm' }).click();
  await page.getByRole('button', { name: 'Open cart with 1 item', exact: true }).click();
  const actions = page.getByLabel('Cart order actions');
  await expect(actions.getByText('₹500', { exact: true })).toBeVisible();
  await expect(actions.getByText(/Free shipping/)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Free delivery' })).toContainText("You've unlocked free delivery!");
  for (const cart of state.carts) {
    Object.assign(cart, { cart_delivery_details: { details: null, welcome_coupons: {
      code: 'ILOVELUVIA', percent: 10, max_discount_rupees: 100, minimum_subtotal_rupees: 500,
    } } });
  }
  await page.reload();
  await expect(page).toHaveURL(/checkout=cart/);
  await expect(page.getByLabel('Discounted price ₹550')).toBeVisible();
  await expect(actions.getByText(/Includes estimated shipping/)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Free delivery' })).toContainText('Add ₹55 more in items for free delivery!');
  await expect(page.getByText('₹100', { exact: true })).toBeVisible();
  await expect(page.getByText(/Free shipping on items worth ₹500 or more after coupon discounts/)).toBeVisible();
  const whatsapp = await page.getByRole('link', { name: 'Send cart to Luvia on WhatsApp' }).getAttribute('href');
  expect(decodeURIComponent(whatsapp!)).toContain('Indicative shipping: ₹100');
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
  await page.getByRole('button', { name: 'Close cart' }).click();
  await page.getByRole('button', { name: 'Sign in or create account' }).click();
  const accountDialog = page.getByRole('dialog');
  await accountDialog.getByRole('button', { name: 'Create account', exact: true }).first().click();
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
  await expect(accountDialog.getByRole('group', { name: 'Saved addresses' })).toBeVisible();
  expect(state.carts[0].id).toBe(originalCart);
  expect(state.carts[0].user_id).toBe(originalOwner);
  const book = accountDialog.getByRole('group', { name: 'Saved addresses' });
  await expect(accountDialog.getByRole('region', { name: 'Your orders' })).toHaveCount(0);
  await expect(accountDialog.getByRole('link', { name: 'My orders', exact: true })).toHaveAttribute('href', '/?account=orders');
  await accountDialog.getByRole('button', { name: 'Change password', exact: true }).click();
  const passwordForm = accountDialog.getByRole('form', { name: 'Change account password' });
  await expect(passwordForm.getByLabel('Current password', { exact: true })).toHaveAttribute('type', 'password');
  await passwordForm.getByLabel('Show current password', { exact: true }).check();
  await expect(passwordForm.getByLabel('Current password', { exact: true })).toHaveAttribute('type', 'text');
  await passwordForm.getByLabel('Show current password', { exact: true }).uncheck();
  await passwordForm.getByLabel('Current password', { exact: true }).fill('Crochet2026');
  await passwordForm.getByLabel('New password', { exact: true }).fill('Crochet2026');
  await passwordForm.getByLabel('Confirm new password', { exact: true }).fill('Crochet2026');
  await passwordForm.getByRole('button', { name: 'Save new password' }).click();
  await expect(passwordForm.getByRole('alert')).toContainText('different from your current password');
  await passwordForm.getByLabel('Current password', { exact: true }).fill('WrongPassword123');
  await passwordForm.getByLabel('New password', { exact: true }).fill('Crochet2028');
  await passwordForm.getByLabel('Confirm new password', { exact: true }).fill('Crochet2028');
  await passwordForm.getByRole('button', { name: 'Save new password' }).click();
  await expect(passwordForm.getByRole('alert')).toContainText('current password is incorrect');
  await passwordForm.getByLabel('Current password', { exact: true }).fill('Crochet2026');
  await passwordForm.getByLabel('New password', { exact: true }).fill('Crochet2028');
  await passwordForm.getByLabel('Confirm new password', { exact: true }).fill('Crochet2028');
  await passwordForm.getByRole('button', { name: 'Save new password' }).click();
  await expect(accountDialog.getByRole('status').filter({ hasText: 'Your password has been changed' })).toContainText('hello@luviacreations.com');
  await expect(passwordForm).toHaveCount(0);
  expect(state.carts[0].id).toBe(originalCart);
  expect(state.carts[0].user_id).toBe(originalOwner);
  const viewport = page.viewportSize();
  if (viewport && viewport.width >= 640) {
    const expectedWidth = Math.min(viewport.width - 48, viewport.width >= 1024 ? 896 : 768);
    await expect.poll(async () => (await accountDialog.boundingBox())?.width).toBe(expectedWidth);
  }
  await expect(book.getByText(/12 Customer Street/)).toBeVisible();
  await book.getByRole('button', { name: '+ Add new address' }).click();
  const newAddress = book.getByRole('form', { name: 'Add address' });
  await newAddress.getByLabel('House / building and street').fill('5 Office Park');
  await newAddress.getByLabel('City', { exact: true }).fill('New Delhi');
  await newAddress.getByLabel('State', { exact: true }).fill('Delhi');
  await newAddress.getByLabel('Pincode', { exact: true }).fill('110001');
  await newAddress.getByRole('button', { name: 'Save address' }).click();
  await expect(book.getByRole('status')).toHaveText('Address added.');
  await expect(book.getByRole('listitem')).toHaveCount(2);
  await accountDialog.getByRole('button', { name: 'Close account' }).click();
  await page.getByRole('button', { name: /^Open cart with 1 item/ }).click();
  // Signed-in customers' saved address is applied automatically as their default.
  await page.getByRole('button', { name: 'Continue with delivery details' }).click();
  await expect(page.getByLabel('Deliver to saved address')).toBeVisible();
  await page.getByLabel('Deliver to saved address').selectOption({ label: 'Customer Buyer — 5 Office Park, New Delhi 110001' });
  await expect(page).toHaveURL(/checkout=review/);
  await expect(page.getByText('3. Review order request', { exact: true })).toBeVisible();
  const whatsapp = await page.getByRole('link', { name: 'Send cart to Luvia on WhatsApp' }).getAttribute('href');
  expect(decodeURIComponent(whatsapp!)).toContain('5 Office Park');
  await expect(page.getByText('5 Office Park, New Delhi, Delhi, 110001, India', { exact: true })).toBeVisible();
  expect(decodeURIComponent((await page.getByRole('link', { name: 'Send cart to Luvia on WhatsApp' }).getAttribute('href'))!)).toContain('5 Office Park');
  await page.getByRole('button', { name: 'Close cart' }).click();
  await expect(page.getByRole('button', { name: 'My account, signed in as Customer' })).toBeVisible();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  const menu = page.getByRole('navigation', { name: 'Main navigation' });
  await menu.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(menu.getByRole('status')).toContainText('Signed out successfully.');
  await expect(menu.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(menu.getByRole('button', { name: 'Sign out', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close navigation' }).click();
  await expect(page.getByRole('button', { name: 'Sign in or create account' })).toBeVisible();

  await page.getByRole('button', { name: 'Sign in or create account' }).click();
  const signIn = page.getByRole('dialog', { name: 'Sign in to Luvia' }).getByRole('form', { name: 'Customer sign in' });
  await signIn.getByLabel('Account email').fill('buyer@example.test');
  await signIn.getByLabel('Password', { exact: true }).fill('wrong-password1');
  await signIn.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Email or password is incorrect');
  await signIn.getByLabel('Password', { exact: true }).fill('Crochet2028');
  await signIn.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'My account, signed in as Customer' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Close account' }).click();
  await page.getByRole('button', { name: 'My account, signed in as Customer' }).click();
  await page.getByRole('navigation', { name: 'Account navigation' }).getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Sign in or create account' }).click();
  await signIn.getByLabel('Account email').fill('buyer@example.test');
  await page.getByRole('dialog', { name: 'Sign in to Luvia' }).getByRole('button', { name: 'Forgot password?' }).click();
  await expect(page.getByRole('dialog').getByRole('status')).toContainText('password reset link is on its way');
  const recoveryToken = state.recoveryAccessToken;
  expect(recoveryToken).toBeTruthy();
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  // Email links open as a fresh page load, not an in-page hash change.
  await page.goto('about:blank');
  await page.goto(`./#access_token=${recoveryToken}&expires_at=${expiresAt}&expires_in=3600`
    + '&refresh_token=customer-refresh-token&token_type=bearer&type=recovery');
  const reset = page.getByRole('dialog', { name: 'Set a new password' });
  await reset.getByLabel('New password', { exact: true }).fill('Crochet2030');
  await reset.getByLabel('Confirm new password').fill('Crochet2030');
  await reset.getByRole('button', { name: 'Save new password' }).click();
  await expect(reset.getByRole('status')).toContainText('password has been updated');
  await reset.getByRole('button', { name: 'Continue shopping' }).click();
  await expect(page.getByRole('button', { name: 'My account, signed in as Customer' })).toBeVisible();
  await page.getByRole('button', { name: 'My account, signed in as Customer' }).click();
  await page.getByRole('navigation', { name: 'Account navigation' }).getByRole('button', { name: 'My account', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Close account' }).click();
  await page.getByRole('button', { name: 'My account, signed in as Customer' }).click();
  await page.getByRole('navigation', { name: 'Account navigation' }).getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('status')).toContainText('Signed out');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Sign in or create account' }).click();
  await signIn.getByLabel('Account email').fill('buyer@example.test');
  await signIn.getByLabel('Password', { exact: true }).fill('Crochet2026');
  await signIn.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Email or password is incorrect');
  await signIn.getByLabel('Password', { exact: true }).fill('Crochet2030');
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