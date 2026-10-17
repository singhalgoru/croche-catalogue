import { expect, test } from '@playwright/test';
import { installMockSupabase } from './mockSupabase';

test.beforeEach(async ({ page }) => {
  await installMockSupabase(page);
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Shop the Collection' })).toBeVisible();
});

test('home page opens a product page with current purchase actions', async ({ page }) => {
  await page.getByRole('button', { name: 'View Rose Charm' }).click();
  await expect(page).toHaveURL(/\/p\/rose-charm\/$/);
  await expect(page.getByRole('heading', { name: 'Rose Charm', level: 1 })).toBeVisible();
  const purchase = page.getByLabel('Product purchase actions', { exact: true });
  await expect(purchase).toBeVisible();
  await expect(purchase.getByRole('button', { name: 'Share this product' })).toBeVisible();
  await expect(purchase.getByRole('link', { name: 'Ask on WhatsApp' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Delivery and returns' })).toBeVisible();
});

test('cart drawer opens from the catalogue and starts the delivery flow', async ({ page }) => {
  const card = page.getByRole('article', { name: 'Product: Rose Charm' });
  await card.getByRole('button', { name: 'Add to cart — Rose Charm' }).click();
  await expect(page.getByRole('button', { name: 'Open cart with 1 item', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open cart with 1 item', exact: true }).click();
  await expect(page.getByText('Rose Charm — Rose Pink')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue with delivery details' })).toBeVisible();
});

test('collection pages show products, sharing and the go-to-top button', async ({ page }) => {
  await page.goto('/collections/charms/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Handmade Charms', exact: true })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Product: Rose Charm' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Share Charms collection' })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const goToTop = page.getByRole('button', { name: 'Go to top' });
  await expect(goToTop).toBeVisible();
  await goToTop.click({ timeout: 10_000 });
  await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 15_000 }).toBeLessThan(10);
});

test('feedback page keeps its storefront navigation and back-to-top control', async ({ page }) => {
  await page.goto('./?page=feedback', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Share feedback', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to shop' })).toHaveAttribute('href', '/');
  await page.evaluate(() => {
    document.body.style.minHeight = '4000px';
    window.scrollTo(0, 900);
  });
  const goToTop = page.getByRole('button', { name: 'Go to top' });
  await expect(goToTop).toBeVisible();
  await goToTop.click({ timeout: 10_000 });
  await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 15_000 }).toBeLessThan(10);
});
