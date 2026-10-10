import { expect, test } from '@playwright/test';
import { installMockSupabase } from './mockSupabase';

test('admin generates a first-order coupon with exact expiry and can disable it', async ({ page }) => {
  await installMockSupabase(page);
  await page.route('**/rest/v1/welcome_offer*', route => route.fulfill({ json: {
    id: true, enabled: false, percent: 10, max_discount_rupees: 100, minimum_subtotal_rupees: 500, valid_days: 30,
  } }));
  let coupons: { id: string; code: string; enabled: boolean; expires_at: string }[] = [];
  await page.route('**/rest/v1/campaign_coupons*', async route => {
    if (route.request().method() === 'PATCH') {
      coupons[0].enabled = route.request().postDataJSON().enabled;
      await route.fulfill({ json: { id: coupons[0].id } });
    } else await route.fulfill({ json: coupons });
  });
  await page.route('**/rest/v1/rpc/generate_campaign_coupon', async route => {
    const body = route.request().postDataJSON();
    expect(body.first_order).toBe(true);
    expect(body.usage_limit).toBe(1);
    expect(new Date(body.expiry).getTime()).toBeGreaterThan(Date.now());
    const coupon = { id: 'campaign', code: 'LUVIA-0123456789ABCDEF', enabled: true, expires_at: body.expiry,
      percent: body.discount_percent, max_discount_rupees: body.discount_cap,
      minimum_subtotal_rupees: body.minimum_subtotal, max_redemptions: body.usage_limit,
      first_order_only: body.first_order };
    coupons.push(coupon);
    await route.fulfill({ json: coupon });
  });
  await page.goto('./#admin');
  await page.getByLabel('Email', { exact: true }).fill('admin@luvia.test');
  await page.getByLabel('Password').fill('test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Admin payment testing' })).toBeVisible();
  await page.getByRole('button', { name: 'Load my cart for test payment' }).click();
  await expect(page.getByRole('alert')).toContainText('Your cart is empty');
  await expect(page.getByText('First-order coupon — ILOVELUVIA', { exact: true })).toBeVisible();
  await page.getByLabel('First order only', { exact: true }).check();
  await page.getByLabel('Coupon expiry (your local time)').fill('2026-11-10T13:30');
  await page.getByRole('button', { name: 'Generate random coupon' }).click();
  await expect(page.getByText('LUVIA-0123456789ABCDEF', { exact: true })).toBeVisible();
  await expect(page.getByText(/Expires.*2026/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Disable coupon', exact: true }).click();
  await expect(page.getByText('Coupon disabled for new orders.', { exact: true })).toBeVisible();
  expect(coupons[0].enabled).toBe(false);
});
