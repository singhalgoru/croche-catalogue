import { expect, test } from '@playwright/test';
import { installMockSupabase } from './mockSupabase';

test('password-only admin is gated until authenticator verification', async ({ page }) => {
  await installMockSupabase(page);
  let verified = false;
  await page.route('**/rest/v1/rpc/admin_access_status', route => route.fulfill({
    json: { isAdmin: true, locked: false, verified },
  }));
  const user = { id: 'admin-user', email: 'admin@luvia.test', aud: 'authenticated', role: 'authenticated',
    email_confirmed_at: '2026-01-01T00:00:00Z', is_anonymous: false,
    factors: [{ id: 'factor', factor_type: 'totp', status: 'verified' }] };
  await page.route('**/auth/v1/user', route => route.fulfill({ json: user }));
  await page.route('**/auth/v1/factors/factor/challenge', route => route.fulfill({ json: { id: 'challenge', expires_at: 9999999999 } }));
  await page.route('**/auth/v1/factors/factor/verify', async route => {
    const body = route.request().postDataJSON();
    if (body.code !== '123456') {
      await route.fulfill({ status: 422, json: { message: 'Invalid authenticator code' } }); return;
    }
    verified = true;
    const token = route.request().headers().authorization!.slice(7);
    await route.fulfill({ json: { access_token: token, refresh_token: 'mfa-refresh', expires_in: 3600, token_type: 'bearer', user } });
  });
  await page.goto('./#admin');
  await page.getByLabel('Email').fill('admin@luvia.test');
  await page.getByLabel('Password').fill('test-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Protect your admin account' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Products', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  await page.getByLabel('Six-digit code').fill('000000');
  await page.getByRole('button', { name: 'Verify and continue' }).click();
  await expect(page.getByRole('alert')).toContainText('Invalid authenticator code');
  await page.getByLabel('Six-digit code').fill('123456');
  await page.getByRole('button', { name: 'Verify and continue' }).click();
  await expect(page.getByRole('button', { name: 'Products', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
