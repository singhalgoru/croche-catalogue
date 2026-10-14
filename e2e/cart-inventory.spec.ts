import { expect, test } from '@playwright/test';
import { installMockSupabase } from './mockSupabase';

test('empty cart Shop now link returns directly to homepage products', async ({ page }) => {
  await installMockSupabase(page);
  await page.goto('/?checkout=cart');
  await expect(page.getByText('Your cart is empty', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Shop now', exact: true }).click();
  await expect(page).toHaveURL(/\/#products$/);
  await expect(page.getByText('Your cart is empty', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'View Rose Charm', exact: true })).toBeInViewport();
});

test('zero quantity shows out of stock and cannot be added even with a stale stock flag', async ({ page }) => {
  const state = await installMockSupabase(page);
  for (const variant of state.products[0].product_variants) {
    Object.assign(variant, { in_stock: true, available_quantity: 0 });
  }
  await page.goto('/');
  const card = page.locator('article').filter({ has: page.getByRole('button', { name: 'View Rose Charm', exact: true }) });
  await expect(card.getByText('Out of stock', { exact: true })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Add to cart — Rose Charm', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'View Rose Charm', exact: true }).click();
  await expect(page.getByText('Out of stock', { exact: true }).last()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add to cart — Rose Charm', exact: true })).toHaveCount(0);
  expect(state.carts.flatMap(cart => cart.cart_items)).toHaveLength(0);
});

test('product and cart quantities stop at stock and stale excess quantities block checkout', async ({ page }) => {
  const state = await installMockSupabase(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'View Rose Charm', exact: true }).click();
  await page.getByRole('button', { name: 'Add to cart — Rose Charm', exact: true }).click();
  const increase = page.getByRole('button', { name: 'Increase quantity of Rose Charm — Rose Pink' });
  await increase.click();
  await expect(page.getByLabel('2 of Rose Charm — Rose Pink in cart', { exact: true })).toBeVisible();
  await increase.click();
  await expect(page.getByLabel('3 of Rose Charm — Rose Pink in cart', { exact: true })).toBeVisible();
  await expect(increase).toBeDisabled();
  await page.getByRole('button', { name: 'Open cart with 3 items', exact: true }).click();
  await expect(increase).toBeDisabled();
  state.carts[0].cart_items[0].quantity = 5;
  await page.reload();
  await expect(page.getByText('Only 3 available. Reduce the quantity to continue.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue with delivery details' })).toBeDisabled();
  await page.getByRole('button', { name: 'Decrease quantity of Rose Charm — Rose Pink' }).click();
  await expect(page.getByText('Only 3 available. Reduce the quantity to continue.', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Continue with delivery details' })).toBeEnabled();
});

test('surfaces backend stock rejection without increasing the saved cart quantity', async ({ page }) => {
  const state = await installMockSupabase(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'View Rose Charm', exact: true }).click();
  await page.getByRole('button', { name: 'Add to cart — Rose Charm', exact: true }).click();
  await expect(page.getByLabel('1 of Rose Charm — Rose Pink in cart', { exact: true })).toBeVisible();
  await page.route('**/rest/v1/cart_items*', route => {
    if (route.request().method() !== 'POST') return route.fallback();
    return route.fulfill({ status: 400, json: { message: 'Only 1 available for Rose Pink. Please reduce the quantity or remove this item.' } });
  });
  await page.getByRole('button', { name: 'Increase quantity of Rose Charm — Rose Pink' }).click();
  await expect(page.getByRole('alert')).toContainText('Available quantity');
  await expect(page.getByRole('alert')).toContainText('We currently have 1 piece of Rose Pink available.');
  await expect(page.getByRole('alert')).toHaveClass(/bg-cream/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByLabel('1 of Rose Charm — Rose Pink in cart', { exact: true })).toBeVisible();
  expect(state.carts[0].cart_items[0].quantity).toBe(1);
});
