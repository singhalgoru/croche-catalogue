import { expect, test } from '@playwright/test';
import { installMockSupabase } from './mockSupabase';

test('install suggestion is eligible-only, dismissible and shown once per session', async ({ page }) => {
  await installMockSupabase(page);
  await page.goto('./');
  await expect(page.getByRole('region', { name: 'Install Luvia app' })).toHaveCount(0);
  const offerInstall = () => page.evaluate(() => {
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: async () => undefined,
      userChoice: Promise.resolve({ outcome: 'dismissed' }),
    });
    window.dispatchEvent(event);
  });
  await offerInstall();
  const suggestion = page.getByRole('region', { name: 'Install Luvia app' });
  await expect(suggestion).toBeVisible({ timeout: 10000 });
  for (const name of ['Install app', 'Not now']) {
    expect((await suggestion.getByRole('button', { name, exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await suggestion.getByRole('button', { name: 'Not now' }).click();
  await expect(suggestion).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Install App', exact: true })).toBeVisible();
  await page.reload();
  await offerInstall();
  await page.waitForTimeout(6500);
  await expect(suggestion).toHaveCount(0);
  await page.getByRole('button', { name: 'Install App', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Install App', exact: true })).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await offerInstall();
  await expect(page.getByRole('button', { name: 'Install App', exact: true })).toHaveCount(0);
});
