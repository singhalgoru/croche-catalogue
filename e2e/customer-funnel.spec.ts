import { expect, test } from '@playwright/test';
import { installMockSupabase } from './mockSupabase';

for (const source of ['empty cart', 'Collections']) {
test(`${source} shop link lands at the collection heading below mobile search`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installMockSupabase(page);
  await page.goto(source === 'Collections' ? '/collections/' : '/');
  if (source === 'empty cart') await page.getByRole('button', { name: 'Open cart with 0 items', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Mobile navigation', exact: true })).toBeInViewport({ ratio: 1 });
  await page.getByRole('link', { name: source === 'Collections' ? 'Shop all products' : 'Shop now', exact: true }).click();
  await expect(page).toHaveURL(/\/#products$/);
  const heading = page.getByRole('heading', { name: 'Shop the Collection', exact: true });
  const search = page.locator('.mobile-search');
  await expect.poll(async () => {
    const headingBox = (await heading.boundingBox())!;
    const searchBox = (await search.boundingBox())!;
    return headingBox.y - searchBox.y - searchBox.height;
  }).toBeGreaterThanOrEqual(10);
  await expect.poll(async () => (await heading.boundingBox())!.y).toBeLessThan(90);
  await expect(page.getByRole('article', { name: 'Product: Rose Charm', exact: true })).toBeInViewport();
});
}

test('guest checkout prominently offers signup without leaving the current checkout step', async ({ page }) => {
  await installMockSupabase(page);
  await page.route('**/rest/v1/welcome_offer*', route => route.fulfill({ json: {
    id: true, enabled: true, percent: 10, max_discount_rupees: 100, minimum_subtotal_rupees: 500, valid_days: 30,
  } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Add to cart — Rose Charm', exact: true }).click();
  await page.getByRole('button', { name: 'Open cart with 1 item', exact: true }).click();
  const banner = page.getByRole('region', { name: 'Welcome discount' });
  await expect(banner).toContainText('10% off your first order');
  await expect(banner).not.toContainText('additional');
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
  if (page.viewportSize()!.width >= 768) await expect(methods.getByText('Wallet', { exact: true })).toBeVisible();
  await expect(footer.locator('> div > p').last()).toContainText(`© ${new Date().getFullYear()} Luvia Creations.`);
  const methodsBox = (await methods.boundingBox())!;
  const contactsBox = (await footer.getByRole('link', { name: page.viewportSize()!.width < 768 ? 'Contact us' : 'hello@luviacreations.com', exact: true }).boundingBox())!;
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
  await expect(cart.getByRole('link', { name: 'Send cart to Luvia on WhatsApp' })).toBeHidden();
  await expect(cart.getByText('Items subtotal', { exact: true })).toBeVisible();
  await expect(cart.getByText('Save or select your delivery address to calculate shipping. The current shipping amount is an estimate.', { exact: true })).toBeVisible();
  await cart.getByText('Price breakdown', { exact: true }).click();
  await expect(cart.getByText('Items subtotal', { exact: true })).toBeHidden();
  await expect(cart.getByLabel('Delivery pincode (optional)')).toHaveCount(0);
  await expect(cart.getByText(/^Delivery pincode:/)).toHaveCount(0);
  await expect(cart.getByRole('region', { name: 'Free delivery' })).toContainText('Add ₹151 more in items for free delivery!');
});

test('guest address is saved, reviewed, shared and restored without showing payment', async ({ page }) => {
  const analytics: unknown[][] = [];
  await page.exposeFunction('capturePurchaseIntent', (args: unknown[]) => analytics.push(args));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'userAgent', { get: () => 'Analytics regression browser' });
    Object.defineProperty(navigator, 'userAgentData', { get: () => undefined });
    const target = window as Window & { capturePurchaseIntent: (args: unknown[]) => Promise<void> };
    target.gtag = (...args: unknown[]) => { void target.capturePurchaseIntent(args); };
  });
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
  await expect(page.getByText('The welcome reward requires an activated account. Guest checkout remains available.')).toHaveCount(0);
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
  const whatsappButton = page.getByRole('link', { name: 'Send cart to Luvia on WhatsApp' });
  await whatsappButton.evaluate(node => node.addEventListener('click', event => event.preventDefault()));
  await whatsappButton.click();
  await expect.poll(() => analytics.filter(args => args[1] === 'generate_lead').length).toBe(1);
  expect(analytics.find(args => args[1] === 'generate_lead')?.[2]).toMatchObject({ lead_source: 'whatsapp', contact_location: 'cart', currency: 'INR' });
  expect(analytics.some(args => args[1] === 'add_to_cart')).toBe(true);
  expect(analytics.some(args => args[1] === 'begin_checkout')).toBe(true);
  expect(analytics.some(args => args[1] === 'purchase')).toBe(false);
  for (const personal of ['Guest Buyer', '9876543210', '12 Guest Street']) expect(JSON.stringify(analytics)).not.toContain(personal);
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
  await expect(page.getByRole('link', { name: 'Send cart to Luvia on WhatsApp' })).toBeHidden();
  await expect(page.getByLabel('Checkout total', { exact: true })).toContainText('Estimated total: ₹550');
});

test('checkout signup with password activates the same cart owner, shows the name in the menu and signs back in', async ({ page }) => {
  const state = await installMockSupabase(page);
  const feedbackSubmissions: Record<string, unknown>[] = [];
  await page.route('**/rest/v1/rpc/store_feedback_delivery_status', route => route.fulfill({ json: 'sent' }));
  await page.route('**/rest/v1/rpc/submit_store_feedback', async route => {
    const body = route.request().postDataJSON();
    feedbackSubmissions.push(body);
    await route.fulfill({ json: body.request_id });
  });
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
  await expect(page.getByRole('button', { name: 'Open navigation' })).toBeVisible();
  const signedOutHeaderHeight = (await page.getByRole('banner').boundingBox())!.height;
  await page.getByRole('article', { name: 'Product: Rose Charm' })
    .getByRole('button', { name: 'Add to cart — Rose Charm' }).click();
  await page.getByRole('button', { name: 'Open cart with 1 item', exact: true }).click();
  const originalOwner = state.carts[0].user_id;
  const originalCart = state.carts[0].id;
  await page.getByRole('button', { name: 'Close cart' }).click();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Sign in', exact: true }).click();
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
  await expect(accountDialog).toHaveCount(0);
  const navigation = page.getByRole('button', { name: 'Open navigation', exact: true });
  const mobile = page.viewportSize()!.width < 640;
  const identity = mobile ? page.getByRole('button', { name: 'My account, signed in as Customer', exact: true }) : navigation;
  if (!mobile) await expect(identity).toHaveAccessibleDescription('Signed in as Customer');
  if (page.viewportSize()!.width >= 1024) {
    const greeting = page.getByText('Hello, Customer', { exact: true });
    await expect(greeting).toBeVisible();
    const greetingBox = (await greeting.boundingBox())!;
    const searchBox = (await page.getByRole('link', { name: 'Search products', exact: true }).boundingBox())!;
    expect(greetingBox.x + greetingBox.width).toBeLessThanOrEqual(searchBox.x);
  }
  else await expect(page.getByText('Hello, Customer', { exact: true })).toBeHidden();
  await expect(identity.locator('span[aria-hidden="true"]')).toHaveText('C');
  expect((await page.getByRole('banner').boundingBox())!.height).toBe(signedOutHeaderHeight);
  await expect(navigation).toBeInViewport({ ratio: 1 });
  const accountScroll = await page.evaluate(() => window.scrollY);
  let finishAccountLoad!: () => void;
  const accountLoad = new Promise<void>(resolve => { finishAccountLoad = resolve; });
  await page.route('**/auth/v1/user', async route => { await accountLoad; await route.fallback(); });
  if (mobile) {
    await identity.click();
  } else {
    await navigation.click();
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'My account', exact: true }).click();
  }
  await expect(accountDialog.getByRole('status')).toContainText('Loading your account');
  const openingBox = (await accountDialog.boundingBox())!;
  finishAccountLoad();
  await expect(accountDialog.getByRole('group', { name: 'Saved addresses' })).toBeVisible();
  await expect(accountDialog.getByText('Loading addresses…', { exact: true })).toHaveCount(0);
  const loadedBox = (await accountDialog.boundingBox())!;
  expect(Math.abs(loadedBox.y - openingBox.y)).toBeLessThan(1);
  expect(Math.abs(loadedBox.height - openingBox.height)).toBeLessThan(1);
  await page.unroute('**/auth/v1/user');
  await accountDialog.getByRole('link', { name: 'Share feedback', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(accountDialog.getByRole('button', { name: 'Close account', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(accountDialog).toHaveCount(0);
  expect(Math.abs(await page.evaluate(() => window.scrollY) - accountScroll)).toBeLessThan(1);
  if (mobile) {
    await expect(identity).toBeFocused();
    await identity.click();
  } else {
    await navigation.click();
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'My account', exact: true }).click();
  }
  await expect(accountDialog.getByRole('group', { name: 'Saved addresses' })).toBeVisible();
  expect(state.carts[0].id).toBe(originalCart);
  expect(state.carts[0].user_id).toBe(originalOwner);
  const book = accountDialog.getByRole('group', { name: 'Saved addresses' });
  await expect(accountDialog.getByRole('region', { name: 'Your orders' })).toHaveCount(0);
  await expect(accountDialog.getByRole('link', { name: 'My orders', exact: true })).toHaveAttribute('href', '/?account=orders');
  await expect(accountDialog.getByText('Signed-in email:').locator('..')).toContainText('buyer@example.test');
  await expect(accountDialog.getByRole('link', { name: 'Share feedback', exact: true })).toHaveAttribute('href', '/?page=feedback');
  await expect(accountDialog.getByRole('form', { name: 'Share feedback form' })).toHaveCount(0);
  await accountDialog.getByRole('link', { name: 'Share feedback', exact: true }).click();
  await expect(page).toHaveURL(/page=feedback/);
  const feedbackForm = page.getByRole('main').getByRole('form', { name: 'Share feedback form' });
  await feedbackForm.getByLabel('Your feedback').fill('Please add more colour options to the catalogue.');
  await feedbackForm.getByRole('button', { name: 'Send feedback' }).click();
  await expect(page.getByRole('main').getByRole('status')).toContainText('Your feedback has been sent to feedback@luviacreations.com');
  expect(feedbackSubmissions[0]).toMatchObject({ contact_name: '', contact_email: '', wants_reply: false });
  expect(state.carts[0].id).toBe(originalCart);
  expect(state.carts[0].user_id).toBe(originalOwner);
  await page.getByRole('main').getByRole('link', { name: 'Back to shop' }).click();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'My account', exact: true }).click();
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
  await expect(accountDialog.getByRole('status').filter({ hasText: 'Your password has been changed' })).toContainText('A notification will be sent to your email address for this change.');
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
  await page.getByRole('button', { name: 'Open navigation' }).click();
  const menu = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(menu).toContainText('Signed in as Customer');
  await menu.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(menu.getByRole('status')).toContainText('Signed out successfully.');
  await expect(page.getByRole('button', { name: 'Close navigation', exact: true })).not.toHaveAttribute('aria-describedby');
  if (mobile) await expect(page.getByRole('button', { name: 'Sign in or create account', exact: true })).toBeVisible();
  await expect(menu.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(menu.getByRole('button', { name: 'Sign out', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close navigation' }).click();
  await expect(page.getByRole('button', { name: 'Open navigation' })).toBeVisible();

  await page.getByRole('button', { name: 'Open navigation' }).click();
  await menu.getByRole('button', { name: 'Sign in', exact: true }).click();
  const signIn = page.getByRole('dialog', { name: 'Sign in to Luvia' }).getByRole('form', { name: 'Customer sign in' });
  await signIn.getByLabel('Account email').fill('buyer@example.test');
  await signIn.getByLabel('Password', { exact: true }).fill('wrong-password1');
  await signIn.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Email or password is incorrect');
  await signIn.getByLabel('Password', { exact: true }).fill('Crochet2028');
  await signIn.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await menu.getByRole('button', { name: 'My account', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'My account', exact: true })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Close account' }).click();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await menu.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await menu.getByRole('button', { name: 'Sign in', exact: true }).click();
  await signIn.getByLabel('Account email').fill('buyer@example.test');
  await page.getByRole('dialog', { name: 'Sign in to Luvia' }).getByRole('button', { name: 'Forgot password?' }).click();
  const recoveryRequest = page.getByRole('form', { name: 'Forgot password', exact: true });
  await expect(recoveryRequest.getByLabel('Password', { exact: true })).toHaveCount(0);
  await expect(recoveryRequest.locator('input')).toHaveCount(1);
  await recoveryRequest.getByRole('button', { name: 'Send reset link' }).click();
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
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(menu).toContainText('Signed in as Customer');
  await menu.getByRole('button', { name: 'My account', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Close account' }).click();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await menu.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('status')).toContainText('Signed out');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Open navigation' }).click();
  await menu.getByRole('button', { name: 'Sign in', exact: true }).click();
  await signIn.getByLabel('Account email').fill('buyer@example.test');
  await signIn.getByLabel('Password', { exact: true }).fill('Crochet2026');
  await signIn.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Email or password is incorrect');
  await signIn.getByLabel('Password', { exact: true }).fill('Crochet2030');
  await signIn.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(menu).toContainText('Signed in as Customer');
});

test('header account options open sign in and signup on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await installMockSupabase(page);
  await page.goto('./');
  const search = page.getByRole('link', { name: 'Search handmade favourites', exact: true });
  const menu = page.getByRole('button', { name: 'Open navigation' });
  await expect(search).toBeInViewport({ ratio: 1 });
  const searchBox = (await search.boundingBox())!;
  const menuBox = (await menu.boundingBox())!;
  expect(searchBox.y + searchBox.height).toBeLessThanOrEqual(menuBox.y);
  await page.getByRole('button', { name: 'Sign in or create account', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Sign in to Luvia' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Mobile navigation', exact: true })).toBeHidden();
  await page.keyboard.press('Escape');
  await menu.click();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Create account' }).click();
  const dialog = page.getByRole('dialog', { name: 'Create your Luvia account' });
  await expect(dialog.getByLabel('Confirm password')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('header actions stay separate with touch-sized controls on narrow and wide screens', async ({ page }) => {
  await installMockSupabase(page);
  for (const width of [320, 390, 768, 1280, 1600]) {
    await page.setViewportSize({ width, height: 900 });
    for (const pathname of ['./', './search/', './p/rose-charm/']) {
      await page.goto(pathname);
      if (width < 640 && pathname === './search/') {
        await expect(page.getByRole('banner')).toBeHidden();
        await expect(page.getByRole('navigation', { name: 'Mobile navigation', exact: true })).toBeHidden();
        await expect(page.getByRole('link', { name: 'Back from search', exact: true })).toBeInViewport({ ratio: 1 });
        const input = page.getByRole('searchbox', { name: 'Search products', exact: true });
        await expect(input).toBeFocused();
        expect((await input.boundingBox())!.y).toBe(8);
        continue;
      }
      const header = page.getByRole('banner');
      const mobile = width < 640;
      const bottomNav = page.getByRole('navigation', { name: 'Mobile navigation', exact: true });
      const controls = mobile ? [
        bottomNav.getByRole('link', { name: 'Home', exact: true }),
        bottomNav.getByRole('link', { name: 'Collections', exact: true }),
        bottomNav.getByRole('button', { name: 'Open cart with 0 items', exact: true }),
        bottomNav.getByRole('button', { name: 'Sign in or create account', exact: true }),
        bottomNav.getByRole('button', { name: 'Open navigation', exact: true }),
      ] : [
        header.getByRole('link', { name: 'Search products', exact: true }),
        header.getByRole('button', { name: 'Open cart with 0 items', exact: true }),
        header.getByRole('button', { name: 'Open navigation', exact: true }),
      ];
      let right = 0;
      for (const control of controls) {
        await expect(control).toBeInViewport({ ratio: 1 });
        const box = (await control.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.x).toBeGreaterThanOrEqual(right);
        right = box.x + box.width;
      }
      const logo = (await header.getByRole('link', { name: 'Luvia Creations — home' }).boundingBox())!;
      if (mobile) {
        expect((await header.getByRole('link', { name: 'Luvia Creations — home' }).getByRole('img').boundingBox())!.width).toBe(pathname === './' ? 80 : 48);
        if (pathname === './') expect(Math.abs(logo.x + logo.width / 2 - width / 2)).toBeLessThan(1);
        else expect(logo.x).toBe(16);
        expect(logo.y + logo.height).toBeLessThanOrEqual((await bottomNav.boundingBox())!.y);
        await expect(header.getByRole('button', { name: 'Open navigation', exact: true })).toBeHidden();
        await expect(header.getByRole('button', { name: 'Open cart with 0 items', exact: true })).toBeHidden();
        const search = pathname === './search/' ? page.getByRole('searchbox', { name: 'Search products', exact: true })
          : page.getByRole('link', { name: 'Search handmade favourites', exact: true });
        await expect(search).toBeVisible();
        expect((await search.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      } else {
        expect((await header.getByRole('link', { name: 'Luvia Creations — home' }).getByRole('img').boundingBox())!.width).toBe(pathname === './' ? 176 : 48);
        const search = (await controls[0].boundingBox())!;
        expect(logo.x + logo.width).toBeLessThanOrEqual(search.x);
        await expect(bottomNav).toBeHidden();
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    }
  }
});

test('mobile sticky search and bottom navigation work without covering dialogs, checkout or product actions', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await installMockSupabase(page);
  state.categories.push('Festive Specials');
  state.categorySettings['Festive Specials'] = { priority: 1, isSeasonal: true, productIds: ['product-1'] };
  await page.goto('./');
  await expect(page.getByRole('navigation', { name: 'Explore collections' }).getByRole('link', { name: 'Festive Specials', exact: true })).toBeVisible();
  const navigation = page.getByRole('navigation', { name: 'Mobile navigation', exact: true });
  const searchLink = page.getByRole('link', { name: 'Search handmade favourites', exact: true });
  await expect(navigation.getByRole('link', { name: 'Home', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('heading', { name: 'Shop the Collection', exact: true }).scrollIntoViewIfNeeded();
  await expect.poll(async () => (await searchLink.boundingBox())!.y).toBe(8);
  const filters = page.getByRole('button', { name: 'Filters', exact: true });
  await expect(filters).toBeInViewport({ ratio: 1 });
  const searchBox = (await searchLink.boundingBox())!;
  const filterBox = (await filters.boundingBox())!;
  expect(filterBox.y).toBe(searchBox.y);
  expect(filterBox.height).toBe(44);
  expect(searchBox.x + searchBox.width).toBeLessThan(filterBox.x);
  await filters.click();
  const filterPanel = page.getByRole('dialog', { name: 'Filter products', exact: true });
  await expect(filterPanel).toBeVisible();
  await expect(filterPanel.getByRole('button', { name: 'Festive Specials', exact: true })).toBeVisible();
  await filterPanel.getByRole('button', { name: 'Charms', exact: true }).click();
  await filterPanel.getByRole('button', { name: 'Show results', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Filters, 1 active', exact: true })).toBeVisible();
  const activeChip = page.getByRole('button', { name: 'Clear category filter: Charms', exact: true });
  await expect(activeChip).toHaveCount(1);
  expect(await activeChip.evaluate(element => Boolean(element.closest('.mobile-search')))).toBe(false);
  await page.getByRole('button', { name: 'Clear all filters', exact: true }).click();
  await expect(filters).toBeVisible();
  await expect(navigation).toBeInViewport({ ratio: 1 });
  await navigation.getByRole('button', { name: 'Open navigation', exact: true }).click();
  const more = page.getByRole('navigation', { name: 'Main navigation', exact: true });
  for (const label of ['About & contact', 'Ordering FAQ', 'Contact on WhatsApp', 'Bulk orders & gifting', 'Privacy policy', 'Terms & conditions']) {
    await expect(more.getByRole('link', { name: label, exact: true })).toHaveAttribute('href', /.+/);
  }
  await page.keyboard.press('Escape');
  await expect(navigation.getByRole('button', { name: 'Open navigation', exact: true })).toBeFocused();
  await searchLink.click();
  await expect(page.getByRole('searchbox', { name: 'Search products', exact: true })).toBeFocused();
  await expect(page.getByRole('banner')).toBeHidden();
  await expect(navigation).toBeHidden();
  await page.getByRole('searchbox', { name: 'Search products', exact: true }).fill('rose');
  await expect(page.getByRole('status').filter({ hasText: '1 product found' })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search products', exact: true }).press('Enter');
  await expect(page).toHaveURL(/search\/\?q=rose$/);
  await page.setViewportSize({ width: 390, height: 500 });
  await expect(navigation).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(navigation).toBeHidden();
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await expect(page.getByRole('searchbox', { name: 'Search products', exact: true })).toBeEmpty();
  await expect(page.getByRole('searchbox', { name: 'Search products', exact: true })).toBeFocused();
  await expect(page.getByRole('region', { name: 'Recent searches', exact: true }).getByRole('button', { name: 'rose', exact: true })).toBeVisible();
  await page.reload();
  const recent = page.getByRole('region', { name: 'Recent searches', exact: true });
  await recent.getByRole('button', { name: 'rose', exact: true }).click();
  await expect(page.getByRole('searchbox', { name: 'Search products', exact: true })).toHaveValue('rose');
  await expect(page.getByRole('status').filter({ hasText: '1 product found' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await recent.getByRole('button', { name: 'Remove recent search: rose', exact: true }).click();
  await expect(recent).toHaveCount(0);
  await page.getByRole('link', { name: 'Back from search', exact: true }).click();
  await expect(page).not.toHaveURL(/\/search\//);
  await expect(navigation).toBeVisible();
  await navigation.getByRole('link', { name: 'Collections', exact: true }).click();
  await expect(navigation.getByRole('link', { name: 'Collections', exact: true })).toHaveAttribute('aria-current', 'page');
  await navigation.getByRole('button', { name: 'Open cart with 0 items', exact: true }).click();
  await expect(page).toHaveURL(/checkout=cart/);
  await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1);
  await expect(navigation.getByRole('button', { name: 'Open cart with 0 items', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(navigation.getByRole('link', { name: 'Collections', exact: true })).not.toHaveAttribute('aria-current', 'page');
  const cartLogo = (await page.getByRole('link', { name: 'Luvia Creations — home' }).boundingBox())!;
  await expect(page.getByRole('link', { name: 'Luvia Creations — home' })).toContainText('Luvia Creations');
  expect((await page.getByRole('link', { name: 'Luvia Creations — home' }).getByRole('img').boundingBox())!.width).toBe(48);
  expect(cartLogo.x).toBe(16);
  await page.goto('./p/rose-charm/');
  const purchaseActions = page.getByLabel('Product purchase actions', { exact: true });
  await expect(purchaseActions).toBeInViewport({ ratio: 1 });
  const purchaseBox = (await purchaseActions.boundingBox())!;
  const navBox = (await navigation.boundingBox())!;
  expect(purchaseBox.y + purchaseBox.height).toBeLessThanOrEqual(navBox.y);
  await purchaseActions.getByRole('button', { name: 'Add to cart — Rose Charm', exact: true }).click();
  await navigation.getByRole('button', { name: 'Open cart with 1 item', exact: true }).click();
  await expect(page).toHaveURL(/checkout=cart/);
  await expect(navigation).toBeInViewport({ ratio: 1 });
  await expect(navigation.getByRole('button', { name: 'Open cart with 1 item', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(searchLink).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Close cart', exact: true })).toBeVisible();
  await page.getByRole('contentinfo').scrollIntoViewIfNeeded();
  await expect(navigation).toBeInViewport({ ratio: 1 });
  await navigation.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await expect(more).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(navigation.getByRole('button', { name: 'Open navigation', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Continue with delivery details', exact: true }).click();
  await expect(page).toHaveURL(/checkout=delivery/);
  await expect(navigation).toHaveCount(0);
});