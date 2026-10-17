import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// Read-only checks against the deployed site. Never add items to the cart,
// submit forms or sign in here: these run against real customer data.

const trackPageErrors = (page: Page) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  return errors;
};

const sitemapPaths = async (request: APIRequestContext) => {
  const response = await request.get('sitemap.xml');
  expect(response.ok()).toBe(true);
  return [...(await response.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => new URL(match[1]).pathname);
};

test('home page renders products and the go-to-top control works', async ({ page }) => {
  const errors = trackPageErrors(page);
  const response = await page.goto('./');
  expect(response?.ok()).toBe(true);
  await expect(page.getByRole('heading', { name: 'Shop the Collection' })).toBeVisible();
  await expect(page.getByRole('article', { name: /^Product: / }).first()).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const goToTop = page.getByRole('button', { name: 'Go to top' });
  await expect(goToTop).toBeVisible();
  // Playwright's click fails if anything (e.g. a fixed overlay) covers the button.
  await goToTop.click({ timeout: 10_000 });
  await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 15_000 }).toBeLessThan(10);
  expect(errors).toEqual([]);
});

test('a product page shows its details and purchase actions', async ({ page, request }) => {
  const errors = trackPageErrors(page);
  const productPath = (await sitemapPaths(request)).find(path => /^\/p\/[^/]+\/$/.test(path));
  expect(productPath, 'sitemap lists at least one product page').toBeTruthy();

  const html = await (await request.get(productPath!)).text();
  expect(html).toMatch(/<meta property="og:image" content="https:\/\//);
  expect(html).toContain('"@type":"Product"');

  const response = await page.goto(productPath!);
  expect(response?.ok()).toBe(true);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const purchase = page.getByLabel('Product purchase actions', { exact: true });
  await expect(purchase).toBeVisible();
  await expect(purchase.getByRole('button', { name: 'Share this product' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Delivery and returns' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('collections list and a collection page show products', async ({ page, request }) => {
  const errors = trackPageErrors(page);
  const collectionPath = (await sitemapPaths(request)).find(path => /^\/collections\/[^/]+\/$/.test(path));
  expect(collectionPath, 'sitemap lists at least one collection page').toBeTruthy();

  expect((await page.goto('collections/'))?.ok()).toBe(true);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  expect((await page.goto(collectionPath!))?.ok()).toBe(true);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('article', { name: /^Product: / }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /^Share .+ collection$/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('cart page opens without errors', async ({ page }) => {
  const errors = trackPageErrors(page);
  expect((await page.goto('./?checkout=cart'))?.ok()).toBe(true);
  await expect(page.getByRole('heading').first()).toBeVisible();
  expect(errors).toEqual([]);
});

for (const path of ['robots.txt', 'sitemap.xml', 'llms.txt', 'manifest.webmanifest', 'about/', 'faq/', 'return-policy/']) {
  test(`serves ${path}`, async ({ request }) => {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    expect((await response.body()).length).toBeGreaterThan(50);
  });
}
