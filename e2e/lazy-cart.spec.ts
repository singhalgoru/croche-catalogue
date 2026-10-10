import { expect, test } from '@playwright/test';
import { installMockSupabase } from './mockSupabase';

test('returning sessions with deleted carts can browse without creating new carts', async ({ page }) => {
  const state = await installMockSupabase(page);
  let creations = 0;
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/rest/v1/carts' && request.method() === 'POST') creations++;
  });
  await page.goto('./');
  await page.getByRole('article', { name: 'Product: Rose Charm' })
    .getByRole('button', { name: 'Add to cart — Rose Charm' }).click();
  await expect.poll(() => state.carts.length).toBe(1);
  expect(creations).toBe(1);
  state.carts = [];
  await page.reload();
  await expect(page.getByRole('article', { name: 'Product: Rose Charm' })).toBeVisible();
  await page.getByRole('button', { name: 'Open cart with 0 items', exact: true }).click();
  await expect(page.getByText('Your cart is empty', { exact: true })).toBeVisible();
  expect(creations).toBe(1);
  expect(state.carts).toHaveLength(0);
});
