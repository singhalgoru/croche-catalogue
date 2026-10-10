import { expect, test } from '@playwright/test';
import { installMockSupabase } from './mockSupabase';

test('captures nonempty cart network metadata once without sending a browser-supplied IP', async ({ page }) => {
  await installMockSupabase(page);
  const requests: unknown[] = [];
  await page.route('**/functions/v1/capture-cart-network', async route => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ json: { recorded: true } });
  });
  await page.goto('./');
  const card = page.getByRole('article', { name: 'Product: Rose Charm' });
  await expect(card).toBeVisible();
  expect(requests).toHaveLength(0);
  await card.getByRole('button', { name: 'Add to cart — Rose Charm' }).click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0]).toEqual({ cartId: expect.any(String) });
  await expect(card.getByRole('button', { name: /^Add to cart — Rose Charm/ })).toBeEnabled();
  await card.getByRole('button', { name: /^Add to cart — Rose Charm/ }).click();
  await expect(card.getByRole('button', { name: /2 in cart/ })).toBeVisible();
  expect(requests).toHaveLength(1);
  await expect(page.getByText('Network IP:', { exact: false })).toHaveCount(0);
});
