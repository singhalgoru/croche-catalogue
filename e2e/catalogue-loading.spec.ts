import { expect, test } from '@playwright/test';
import { installMockSupabase } from './mockSupabase';

test('renders the built snapshot while live data waits and navigates home without a document request', async ({ page }) => {
  const state = await installMockSupabase(page);
  await page.route('**/', async route => {
    if (!route.request().isNavigationRequest()) { await route.fallback(); return; }
    const response = await route.fetch();
    const snapshot = JSON.stringify({
      products: state.products,
      categories: state.categories.map(name => ({ name, priority: state.categorySettings[name].priority })),
      homepage: { title: 'Catalogue snapshot', description: 'Current catalogue.', canonical: 'https://luviacreations.com/' },
    }).replace(/</g, '\\u003c');
    await route.fulfill({ response, body: (await response.text()).replace('</head>',
      `<script id="catalogue-bootstrap" type="application/json">${snapshot}</script></head>`) });
  });
  let release: () => void = () => {};
  const waiting = new Promise<void>(resolve => { release = resolve; });
  await page.route('http://supabase.test/rest/v1/products?**', async route => {
    await waiting;
    await route.fallback();
  });
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('article', { name: 'Product: Rose Charm' })).toBeVisible();
  await expect(page.getByText('Loading the catalogue…')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Charms', exact: true })).toBeVisible();
  let documentRequests = 0;
  page.on('request', request => { if (request.isNavigationRequest()) documentRequests += 1; });
  await page.getByRole('link', { name: 'Luvia Creations — home' }).click();
  await expect(page.getByRole('article', { name: 'Product: Rose Charm' })).toBeVisible();
  expect(documentRequests).toBe(0);
  release();
  await expect(page.getByRole('button', { name: 'Add to cart — Rose Charm' })).toBeEnabled();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Home Decor', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Product: Flower Coaster' })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Product: Rose Charm' })).toHaveCount(0);
  expect(documentRequests).toBe(0);
});
