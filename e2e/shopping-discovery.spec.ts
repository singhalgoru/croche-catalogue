import { expect, test } from '@playwright/test';
import { installMockSupabase } from './mockSupabase';

test('bestsellers retain full portrait and landscape photos inside square cards', async ({ page }) => {
  const state = await installMockSupabase(page);
  const products = state.products.slice(0, 2);
  for (const [index, product] of products.entries()) {
    product.product_variants[0].in_stock = true;
    product.product_variants[0].available_quantity = 2;
    product.product_variants[0].image_url = `https://images.luviacreations.com/framing-${index}.svg`;
  }
  await page.route('**/framing-*.svg', route => {
    const portrait = route.request().url().includes('framing-0');
    const width = portrait ? 300 : 600;
    const height = portrait ? 600 : 300;
    return route.fulfill({ contentType: 'image/svg+xml',
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="pink"/><rect x="${width - 30}" y="${height - 30}" width="30" height="30" fill="brown"/></svg>` });
  });
  await page.route('**/rest/v1/rpc/get_catalogue_bestsellers', route =>
    route.fulfill({ json: products.map(product => ({ product_id: product.id })) }));
  await page.goto('./');
  const section = page.getByRole('region', { name: 'Bestsellers' });
  await section.scrollIntoViewIfNeeded();
  for (const image of await section.getByRole('img').all()) {
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    const fits = await image.evaluate(node => {
      const img = node as HTMLImageElement;
      const box = img.getBoundingClientRect();
      const scale = Math.min(box.width / img.naturalWidth, box.height / img.naturalHeight);
      return getComputedStyle(img).objectFit === 'contain'
        && img.naturalWidth * scale <= box.width + 0.1
        && img.naturalHeight * scale <= box.height + 0.1;
    });
    expect(fits).toBe(true);
  }
});

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
  for (const image of await section.getByRole('img').all()) {
    await expect.poll(() => image.evaluate(node => getComputedStyle(node).objectFit)).toBe('contain');
  }
  const collections = page.getByRole('navigation', { name: 'Explore collections' });
  await expect(collections.getByRole('link', { name: 'Charms', exact: true }).locator('img')).toBeVisible();
  await section.getByRole('link', { name: /Rose Charm/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/\/p\/rose-charm\/$/);
  await expect(page.getByRole('region', { name: 'Delivery and returns' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'You May Also Like' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Delivery and returns' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Full return and refund policy', includeHidden: true })).toHaveAttribute('href', '/return-policy/');
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
