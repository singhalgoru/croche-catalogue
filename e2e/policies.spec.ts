import { expect, test } from '@playwright/test';
import { installMockSupabase } from './mockSupabase';

test('policy pages load directly and remain linked from the shop footer', async ({ page }) => {
  await installMockSupabase(page);
  for (const [path, title] of [
    ['/terms-and-conditions/', 'Terms & Conditions'],
    ['/privacy-policy/', 'Privacy Policy'],
  ]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
    await expect(page.getByText('Last updated: 14 October 2026')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Related policies' })
      .getByRole('link', { name: 'Return and refund policy' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
  await page.goto('/');
  const footer = page.getByRole('contentinfo');
  if (page.viewportSize()!.width < 768) await footer.getByRole('button', { name: 'Help & information' }).click();
  await expect(footer.getByRole('link', { name: 'Terms & Conditions' })).toHaveAttribute('href', '/terms-and-conditions/');
  await expect(footer.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy-policy/');
});
