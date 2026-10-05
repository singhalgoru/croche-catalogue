import { expect, test } from '@playwright/test';
import { installMockSupabase } from './mockSupabase';

test('keeps product photos and copy visible while both live data and interactive detail code wait', async ({ page }) => {
  const state = await installMockSupabase(page);
  await page.route('**/p/rose-charm/', async route => {
    const response = await route.fetch({ url: new URL('/', route.request().url()).href });
    const snapshot = JSON.stringify({
      products: state.products,
      categories: state.categories.map(name => ({ name, priority: state.categorySettings[name].priority })),
      homepage: { title: 'Catalogue', description: 'Catalogue.', canonical: 'https://luviacreations.com/' },
    }).replace(/</g, '\\u003c');
    await route.fulfill({ response, body: (await response.text()).replace('</head>',
      `<script id="catalogue-bootstrap" type="application/json">${snapshot}</script></head>`) });
  });
  let releaseData: () => void = () => {};
  let releaseCode: () => void = () => {};
  const dataWaiting = new Promise<void>(resolve => { releaseData = resolve; });
  const codeWaiting = new Promise<void>(resolve => { releaseCode = resolve; });
  await page.route('http://supabase.test/rest/v1/products?**', async route => {
    await dataWaiting; await route.fallback();
  });
  await page.route('**/src/components/ProductModal.tsx', async route => {
    await codeWaiting; await route.fallback();
  });
  await page.goto('./p/rose-charm/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Rose Charm', level: 1 })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Rose Charm', exact: true }).first()).toBeVisible();
  await expect(page.getByText(state.products[0].description, { exact: true })).toBeVisible();
  await expect(page.getByText('Loading product details…')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Rose Charm details' })).toHaveAttribute('aria-busy', 'true');
  releaseCode();
  await expect(page.getByRole('region', { name: 'Rose Charm details' })).toHaveCount(0);
  releaseData();
  await expect(page.getByRole('heading', { name: 'Rose Charm', level: 1 })).toBeVisible();
});
