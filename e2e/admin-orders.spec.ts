import { expect, test } from '@playwright/test';
import { installMockSupabase } from './mockSupabase';
import type { CustomerOrder } from '../src/types/customer';

test('admin collapses online orders and removes only confirmed cancelled entries', async ({ page }) => {
  await installMockSupabase(page);
  const paid: CustomerOrder = {
    id: 'paid-order', reference: 'LUV-PAID', status: 'paid',
    createdAt: '2026-10-10T12:00:00Z', paidAt: '2026-10-10T12:10:00Z',
    customerName: 'Test Buyer', deliveryPincode: '110001',
    subtotal: 500, discount: 0, shipping: 0, total: 500,
    items: [{ id: 'item', productName: 'Rose Charm', variantName: 'Pink', quantity: 1, unitPrice: 500, lineTotal: 500 }],
  };
  let orders: CustomerOrder[] = [paid, { ...paid, id: 'cancelled-order', reference: 'LUV-CANCELLED', status: 'cancelled', paidAt: null }];
  let removals = 0;
  await page.route('**/rest/v1/rpc/get_admin_live_orders', route => route.fulfill({ json: orders }));
  await page.route('**/rest/v1/rpc/hide_cancelled_live_order', async route => {
    expect(route.request().postDataJSON()).toEqual({ target_order_id: 'cancelled-order' });
    removals++;
    orders = orders.filter(order => order.id !== 'cancelled-order');
    await route.fulfill({ status: 204 });
  });
  await page.goto('./#admin');
  await page.getByLabel('Email', { exact: true }).fill('admin@luvia.test');
  await page.getByLabel('Password').fill('test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Orders', exact: true }).click();
  const panel = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: /^Online orders$/ }) });
  await expect(panel).not.toHaveAttribute('open');
  await panel.locator('summary').click();
  const paidOrder = panel.getByRole('article', { name: 'Order LUV-PAID' });
  await expect(paidOrder.getByText('Recipient:', { exact: false })).not.toBeVisible();
  await paidOrder.getByRole('button', { name: 'Show details for LUV-PAID' }).click();
  await expect(paidOrder.getByText('Recipient:', { exact: false })).toBeVisible();
  await expect(paidOrder.getByRole('button', { name: /Remove/ })).toHaveCount(0);
  await paidOrder.getByRole('button', { name: 'Hide details for LUV-PAID' }).click();
  await expect(paidOrder.getByText('Recipient:', { exact: false })).not.toBeVisible();
  await panel.getByRole('button', { name: 'Remove LUV-CANCELLED from list' }).click();
  expect(removals).toBe(0);
  await panel.getByRole('button', { name: 'Keep entry' }).click();
  expect(removals).toBe(0);
  await panel.getByRole('button', { name: 'Remove LUV-CANCELLED from list' }).click();
  await panel.getByRole('button', { name: 'Confirm removal' }).click();
  await expect(panel.getByRole('article', { name: 'Order LUV-CANCELLED' })).toHaveCount(0);
  expect(removals).toBe(1);
  await expect(paidOrder).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await panel.locator('summary').click();
  await expect(panel).not.toHaveAttribute('open');
});
