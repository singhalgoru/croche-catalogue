import { expect, test } from '@playwright/test';
import { installMockSupabase } from './mockSupabase';

test('desktop shoppers can clear price and category filters with the menus closed', async ({ page }) => {
  test.skip(page.viewportSize()!.width < 640, 'Desktop filter controls');
  const state = await installMockSupabase(page);
  state.products[0].price = 200;
  state.products[0].show_price = true;
  for (const variant of state.products[0].product_variants) variant.price = null;
  await page.goto('/');
  await page.getByText('Filter by category', { exact: true }).click();
  await page.getByRole('button', { name: 'Charms', exact: true }).click();
  const priceMenu = page.locator('details').filter({ has: page.locator('summary[aria-label="Filter by price"]') });
  await priceMenu.locator('summary').click();
  await priceMenu.getByLabel('Minimum', { exact: true }).fill('100');
  await priceMenu.getByLabel('Maximum', { exact: true }).fill('300');
  await priceMenu.getByRole('button', { name: 'Apply', exact: true }).click();
  const clearPrice = page.getByRole('button', { name: 'Clear price filter', exact: true });
  await expect(clearPrice).toBeVisible();
  await expect(page.locator('summary[aria-label^="Filter by price:"]').locator('..')).not.toHaveAttribute('open');
  await clearPrice.click();
  await expect(clearPrice).toHaveCount(0);
  await expect(page.getByText('Filter by category: Charms', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters', exact: false }).click();
  await expect(page.getByText('Filter by category', { exact: true })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Product: Flower Coaster', exact: true })).toBeVisible();
});

test('collection price ranges filter products and clear without reopening the menu', async ({ page }) => {
  const state = await installMockSupabase(page);
  const cheap = state.products[0];
  cheap.price = 200;
  cheap.show_price = true;
  for (const variant of cheap.product_variants) variant.price = null;
  const expensive = structuredClone(cheap);
  expensive.id = 'expensive-charm';
  expensive.name = 'Large Rose Charm';
  expensive.price = 800;
  expensive.product_variants = expensive.product_variants.map((variant, index) => ({
    ...variant, id: `expensive-variant-${index}`, product_id: expensive.id,
  }));
  state.products.push(expensive);
  await page.goto('/collections/charms/');
  const filters = page.getByRole('region', { name: 'Filter collection products by price' });
  await filters.locator('summary').click();
  await filters.getByRole('button', { name: /₹\d+\+$/ }).click();
  await expect(filters.locator('details')).not.toHaveAttribute('open');
  await expect(page.getByRole('article', { name: 'Product: Rose Charm', exact: true })).toHaveCount(0);
  await expect(page.getByRole('article', { name: 'Product: Large Rose Charm', exact: true })).toBeVisible();
  await filters.getByRole('button', { name: 'Clear price filter', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Product: Rose Charm', exact: true })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Product: Large Rose Charm', exact: true })).toBeVisible();
  await expect(filters.getByRole('button', { name: 'Clear price filter', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
