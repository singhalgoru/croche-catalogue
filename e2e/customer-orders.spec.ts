import { expect, test } from '@playwright/test';
import { installMockSupabase } from './mockSupabase';
import type { CustomerOrder } from '../src/types/customer';

test('My orders is a full page with active-first history, reorder and restorable hidden entries', async ({ page }) => {
  const state = await installMockSupabase(page);
  await page.goto('./');
  await page.getByRole('article', { name: 'Product: Rose Charm' }).getByRole('button', { name: 'Add to cart — Rose Charm' }).click();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Create account', exact: true }).first().click();
  const signup = page.getByRole('form', { name: 'Customer signup' });
  await signup.getByLabel('Full name').fill('Customer Buyer');
  await signup.getByLabel('Mobile number').fill('9876543210');
  await signup.getByLabel('House / building and street').fill('12 Customer Street');
  await signup.getByLabel('City', { exact: true }).fill('New Delhi');
  await signup.getByLabel('State', { exact: true }).fill('Delhi');
  await signup.getByLabel('Pincode', { exact: true }).fill('110001');
  await signup.getByLabel('Account email').fill('buyer@example.test');
  await signup.getByLabel('Password', { exact: true }).fill('Crochet2026');
  await signup.getByLabel('Confirm password').fill('Crochet2026');
  await signup.getByRole('button', { name: 'Create account' }).click();
  await page.getByLabel('Email verification code').fill('123456');
  await page.getByRole('button', { name: 'Verify email', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'My account', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Saved addresses' })).toBeVisible();
  await page.getByRole('button', { name: 'Close account' }).click();

  const base: CustomerOrder = {
    id: 'active', reference: 'LUV-ACTIVE', status: 'paid', createdAt: '2026-10-01T12:00:00Z',
    paidAt: '2026-10-01T12:10:00Z', customerName: 'Customer Buyer', deliveryPincode: '110001',
    subtotal: 698, discount: 0, shipping: 0, total: 698,
    fulfilment: { status: 'shipped', courierName: '', trackingNumber: '', trackingUrl: '', updatedAt: null },
    items: [{ id: 'saved', productName: 'Rose Charm', variantName: 'Rose Pink', quantity: 2, unitPrice: 349, lineTotal: 698 }],
  };
  const orders: CustomerOrder[] = [
    { ...base, id: 'expired', reference: 'LUV-EXPIRED', status: 'expired', paidAt: null, fulfilment: null, createdAt: '2026-10-11T12:00:00Z' },
    { ...base, id: 'failed', reference: 'LUV-FAILED', status: 'link_failed', paidAt: null, fulfilment: null },
    { ...base, id: 'delivered', reference: 'LUV-DELIVERED', fulfilment: { ...base.fulfilment!, status: 'delivered' } },
    base,
  ];
  await page.route('**/rest/v1/rpc/get_customer_orders', route => {
    const { hidden_orders: hidden } = route.request().postDataJSON();
    return route.fulfill({ json: orders.filter(order => Boolean(order.hidden) === hidden) });
  });
  await page.route('**/rest/v1/rpc/set_customer_order_hidden', route => {
    const body = route.request().postDataJSON();
    orders.find(order => order.id === body.target_order_id)!.hidden = body.hide_order;
    return route.fulfill({ status: 204 });
  });
  await page.route('**/rest/v1/rpc/reorder_customer_order', route => {
    const body = route.request().postDataJSON();
    const cart = state.carts.find(cart => cart.id === body.target_cart_id)!;
    cart.cart_items[0].quantity += 2;
    return route.fulfill({ json: { added: 1, skipped: [{ productName: 'Deleted product', variantName: '', reason: 'No longer available' }] } });
  });
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'My account', exact: true }).click();
  const account = page.getByRole('dialog', { name: 'My account', exact: true });
  await expect(account.getByRole('group', { name: 'Saved addresses' })).toBeVisible();
  await expect(account.getByRole('region', { name: 'Your orders' })).toHaveCount(0);
  await account.getByRole('link', { name: 'My orders', exact: true }).click();
  await expect(page).toHaveURL(/account=orders/);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'My orders' }).click();
  await expect(page).toHaveURL(/account=orders/);
  await expect(page.getByRole('heading', { name: 'My orders', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('article').first()).toHaveAttribute('aria-label', 'Order LUV-ACTIVE');
  await expect(page.getByLabel('Order status for LUV-ACTIVE')).toContainText('Shipped');
  await expect(page.getByLabel('Order status for LUV-DELIVERED')).toContainText('Delivered');
  await expect(page.getByText('Payment received', { exact: true })).toHaveCount(0);
  expect(await page.getByLabel('Order status for LUV-ACTIVE').locator('.text-lg.font-bold').evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(18);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.getByRole('button', { name: 'Reorder LUV-EXPIRED' }).click();
  await expect(page.getByText(/1 order item added to your cart at current prices/)).toBeVisible();
  await expect(page.getByText(/Deleted product: No longer available/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open cart with 3 items', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reorder LUV-DELIVERED' }).click();
  await expect(page.getByRole('button', { name: 'Open cart with 5 items', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Hide LUV-EXPIRED' }).click();
  await expect(page.getByRole('article', { name: 'Order LUV-EXPIRED' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('article', { name: 'Order LUV-EXPIRED' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Hidden orders' }).click();
  await expect(page.getByRole('article', { name: 'Order LUV-EXPIRED' })).toBeVisible();
  await page.getByRole('button', { name: 'Restore LUV-EXPIRED' }).click();
  await page.getByRole('button', { name: 'Current & past orders' }).click();
  await expect(page.getByRole('article', { name: 'Order LUV-EXPIRED' })).toBeVisible();
  await page.getByRole('button', { name: 'Open cart with 5 items', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your cart', exact: true })).toBeVisible();
  expect(state.carts[0].cart_items[0].quantity).toBe(5);
  await page.goto('./?account=orders');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: 'Sign in to view orders' })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Order LUV-ACTIVE' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Sign in to view orders' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});
