import { expect, test } from '@playwright/test';
import { installMockSupabase } from './mockSupabase';

test('cart uses the delivery address instead of a separate pincode panel', async ({ page, isMobile }) => {
  if (isMobile) await page.setViewportSize({ width: 360, height: 780 });
  await installMockSupabase(page);
  await page.goto('/');
  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Rose Charm', exact: true }) });
  await card.getByRole('button', { name: 'Add to cart — Rose Charm' }).click();
  await page.getByRole('button', { name: 'Open cart with 1 item' }).click();
  await expect(page.getByLabel('Delivery pincode (optional)')).toHaveCount(0);
  await expect(page.getByText('How we use your pincode', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Free delivery' })).toContainText('Add ₹151 more in items');
  await page.getByRole('button', { name: 'Continue with delivery details' }).click();
  await expect(page.getByLabel('Recipient name')).toBeVisible();
  await expect(page.getByLabel('Delivery pincode (optional)')).toHaveCount(0);
});

test('choosing another saved address updates its pincode and shipping before payment', async ({ page }) => {
  const state = await installMockSupabase(page);
  const home = { name: 'Buyer', phone: '9876543210', email: 'buyer@example.test',
    addressLine1: '12 Home Street', addressLine2: '', city: 'Delhi', state: 'Delhi', pincode: '110001' };
  const office = { ...home, addressLine1: '5 Office Park', city: 'Pune', state: 'Maharashtra', pincode: '411001' };
  const verifiedPins: string[] = [];
  await page.route('**/rest/v1/checkout_settings*', route => route.fulfill({ json: { id: true, live_enabled: true } }));
  await page.route('**/rest/v1/customer_addresses*', route => route.fulfill({ json: [
    { id: 'home', is_default: true, details: home }, { id: 'office', is_default: false, details: office },
  ] }));
  await page.route('**/functions/v1/verify-delivery-pin', route => {
    const body = route.request().postDataJSON();
    verifiedPins.push(body.pin);
    const cart = state.carts.find(cart => cart.id === body.cartId);
    if (!cart) throw new Error('Missing cart');
    const location = { districts: [body.pin === '411001' ? 'Pune' : 'Delhi'], states: [body.pin === '411001' ? 'Maharashtra' : 'Delhi'], country: 'India' };
    Object.assign(cart, { delivery_pin_code: body.pin, delivery_pin_location: location,
      delivery_pin_checked_at: new Date().toISOString(), delivery_estimate: {
        provider: 'shiprocket', currency: 'INR', minCharge: body.pin === '411001' ? 85 : 50, maxCharge: 100,
        minDays: 2, maxDays: 3, weightGrams: 100, itemCount: 1, checkedAt: new Date().toISOString(),
      } });
    return route.fulfill({ json: { location, checkedAt: cart.delivery_pin_checked_at } });
  });
  await page.route('**/rest/v1/rpc/save_cart_delivery_details', route => {
    const body = route.request().postDataJSON();
    const cart = state.carts.find(cart => cart.id === body.target_cart_id);
    if (!cart) throw new Error('Missing cart');
    Object.assign(cart, { cart_delivery_details: { details: body.delivery, welcome_coupons: null } });
    return route.fulfill({ json: body.delivery });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Add to cart — Rose Charm', exact: true }).click();
  await page.getByRole('button', { name: 'Open cart with 1 item', exact: true }).click();
  await page.getByRole('button', { name: 'Continue with delivery details' }).click();
  await page.getByLabel('Deliver to saved address').selectOption('home');
  await expect(page).toHaveURL(/checkout=review/);
  await expect(page.getByLabel('Cart order actions').getByText('₹399', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit details', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Proceed to payment' })).toHaveCount(0);
  await page.getByLabel('Deliver to saved address').selectOption('office');
  await expect(page).toHaveURL(/checkout=review/);
  await expect(page.getByLabel('Cart order actions').getByText('₹439', { exact: true })).toBeVisible();
  await expect(page.getByText('5 Office Park, Pune, Maharashtra, 411001, India', { exact: true })).toBeVisible();
  expect(state.carts[0].delivery_pin_code).toBe('411001');
  await expect(page.getByRole('button', { name: 'Proceed to payment' })).toBeEnabled();
  await expect(page.getByRole('region', { name: 'Free delivery' })).toContainText('Add ₹151 more in items');
  await expect(page.getByText(/^Delivery pincode:/)).toHaveCount(0);
  state.carts[0].delivery_estimate!.itemCount = 2;
  await page.reload();
  await page.getByRole('button', { name: 'Edit details', exact: true }).click();
  await page.getByLabel('Deliver to saved address').selectOption('office');
  await expect(page).toHaveURL(/checkout=review/);
  await expect(page.getByLabel('Cart order actions').getByText('₹439', { exact: true })).toBeVisible();
  expect(verifiedPins).toEqual(['110001', '411001', '411001']);
});

test('quick view and image zoom cover the hamburger and restore it after closing', async ({ page }) => {
  await installMockSupabase(page);
  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Open navigation' });
  const box = await menu.boundingBox();
  await page.goto('/#product=rose-charm');
  await expect(page.getByRole('dialog', { name: 'Rose Charm', exact: true })).toBeVisible();
  const menuCovered = async () => page.evaluate(({ x, y }) => !document.elementFromPoint(x, y)?.closest('button[aria-label="Open navigation"]'),
    { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 });
  expect(await menuCovered()).toBe(true);
  await page.getByRole('button', { name: 'Open zoomed product image' }).click();
  expect(await menuCovered()).toBe(true);
  await page.getByRole('button', { name: /Close.*(image|zoom)/i }).click();
  await page.getByRole('button', { name: 'Close product details' }).click();
  await expect(menu).toBeVisible();
  await menu.click();
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
});
