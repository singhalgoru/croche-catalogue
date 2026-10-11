import { expect, test } from '@playwright/test';
import { installMockSupabase } from './mockSupabase';

test('homepage ordering guidance starts collapsed and supports pointer and keyboard disclosure', async ({ page }) => {
  await installMockSupabase(page);
  await page.goto('./');
  const guide = page.getByRole('region', { name: 'How ordering and delivery work' });
  const details = guide.locator('details');
  const summary = guide.locator('summary');
  await expect(details).not.toHaveAttribute('open');
  await expect(guide.getByRole('heading', { name: '1. Choose your items' })).not.toBeVisible();
  await summary.click();
  await expect(details).toHaveAttribute('open', '');
  await expect(guide.getByRole('link', { name: 'Read the ordering FAQ' })).toBeVisible();
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(details).not.toHaveAttribute('open');
  await page.keyboard.press('Space');
  await expect(details).toHaveAttribute('open', '');
  await expect(guide.getByRole('link', { name: 'Ask us on WhatsApp' })).toBeVisible();
});
