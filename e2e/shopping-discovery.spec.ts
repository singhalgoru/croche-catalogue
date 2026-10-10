import { expect, test } from '@playwright/test';
import { installMockSupabase } from './mockSupabase';

test('bestsellers open product details with delivery policies and recommendations', async ({ page }) => {
  const state = await installMockSupabase(page);
  await page.route('**/rest/v1/rpc/get_catalogue_bestsellers', route =>
    route.fulfill({ json: [{ product_id: 'product-1' }, { product_id: 'product-2' }] }));
  const coaster = state.products.find(product => product.id === 'product-2')!;
  coaster.category = state.products.find(product => product.id === 'product-1')!.category;
  coaster.in_stock = true;
  coaster.product_variants[0].in_stock = true;
  coaster.product_variants[0].available_quantity = 2;
  await page.goto('./');
  const section = page.getByRole('region', { name: 'Bestsellers' });
  await expect(section).toBeVisible();
  await expect(section.getByRole('link')).toHaveCount(2);
  const collections = page.getByRole('navigation', { name: 'Explore collections' });
  await expect(collections.getByRole('link', { name: 'Charms', exact: true }).locator('img')).toBeVisible();
  await section.getByRole('link', { name: /Rose Charm/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Rose Charm' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('region', { name: 'Delivery and returns' })).toBeVisible();
  await dialog.getByRole('link', { name: 'View full details' }).click();
  await expect(page.getByRole('heading', { name: 'You May Also Like' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Delivery and returns' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Full return and refund policy' })).toHaveAttribute('href', '/return-policy/');
  const recommendations = page.getByRole('region', { name: 'You May Also Like' });
  await recommendations.getByRole('link', { name: /Flower Coaster/ }).click();
  await expect(page.getByRole('heading', { name: 'Flower Coaster', exact: true })).toBeVisible();
});

test('bestsellers stay hidden with insufficient sales-backed products', async ({ page }) => {
  await installMockSupabase(page);
  await page.route('**/rest/v1/rpc/get_catalogue_bestsellers', route =>
    route.fulfill({ json: [{ product_id: 'product-1' }] }));
  await page.goto('./');
  await expect(page.getByRole('article', { name: 'Product: Rose Charm' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Bestsellers' })).toHaveCount(0);
});
