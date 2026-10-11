import { expect, test } from '@playwright/test';
import { installMockSupabase } from './mockSupabase';

test('admin creates a seasonal category, selects existing products and hides it without moving products', async ({ page }) => {
  const state = await installMockSupabase(page);
  type CategoryRow = { name: string; sort_order: number; is_seasonal: boolean; visible: boolean; seasonal_category_products: { product_id: string }[] };
  const categories: CategoryRow[] = state.categories.map(name => ({
    name, sort_order: 100, is_seasonal: false, visible: true, seasonal_category_products: [],
  }));
  await page.route('**/rest/v1/categories*', async route => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      categories.push({ ...body, visible: true, seasonal_category_products: [] });
      await route.fulfill({ status: 201 });
    } else await route.fulfill({ json: categories });
  });
  await page.route('**/rest/v1/rpc/save_seasonal_category', async route => {
    const body = route.request().postDataJSON();
    const category = categories.find(item => item.name === body.category_name)!;
    category.visible = body.show_category;
    category.seasonal_category_products = body.selected_product_ids.map((product_id: string) => ({ product_id }));
    await route.fulfill({ status: 204 });
  });
  await page.goto('./#admin');
  await page.getByLabel('Email', { exact: true }).fill('admin@luvia.test');
  await page.getByLabel('Password').fill('test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: /Manage categories/ }).click();
  await page.getByLabel('New category', { exact: true }).fill('Navaratri');
  await page.getByLabel('Seasonal category', { exact: true }).check();
  await page.getByRole('button', { name: 'Add category', exact: true }).click();
  await page.getByRole('button', { name: 'Manage products', exact: true }).click();
  const editor = page.getByRole('region', { name: 'Products in Navaratri' });
  await editor.getByLabel('Rose Charm · Charms', { exact: true }).check();
  await editor.getByRole('button', { name: 'Save seasonal category' }).click();
  await expect(editor).toHaveCount(0);
  expect(state.products.find(product => product.name === 'Rose Charm')?.category).toBe('Charms');
  await page.goto('./?category=Navaratri');
  await expect(page.getByRole('button', { name: 'Navaratri', exact: true })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Product: Rose Charm' })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Product: New Heart Charm' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Charms', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Product: Rose Charm' })).toBeVisible();
  await page.goto('./#admin');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: /Manage categories/ }).click();
  await page.getByRole('button', { name: 'Manage products', exact: true }).click();
  await editor.getByLabel('Show this seasonal category in the shop').uncheck();
  await editor.getByRole('button', { name: 'Save seasonal category' }).click();
  await expect(editor).toHaveCount(0);
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Navaratri', exact: true })).toHaveCount(0);
  await expect(page.getByRole('article', { name: 'Product: Rose Charm' })).toBeVisible();
});
