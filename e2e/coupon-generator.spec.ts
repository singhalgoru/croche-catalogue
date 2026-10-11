import { expect, test } from '@playwright/test';
import { installMockSupabase } from './mockSupabase';

test('admin generates a first-order coupon with exact expiry, disables it and deletes it', async ({ page }) => {
  await installMockSupabase(page);
  await page.route('**/rest/v1/welcome_offer*', route => route.fulfill({ json: {
    id: true, enabled: false, percent: 10, max_discount_rupees: 100, minimum_subtotal_rupees: 500, valid_days: 30,
  } }));
  let coupons: { id: string; code: string; enabled: boolean; expires_at: string }[] = [];
  await page.route('**/rest/v1/rpc/get_admin_campaign_coupons', route => route.fulfill({ json: coupons }));
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
  await expect(page.getByRole('region', { name: 'Admin payment testing' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Razorpay test payment' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Load my cart for test payment' })).toHaveCount(0);
  await expect(page.getByText('First-order coupon — ILOVELUVIA', { exact: true })).toBeVisible();
  const toggle = page.getByRole('button', { name: 'Generate discount coupons', exact: true });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: 'Generate random coupon' })).toBeHidden();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.getByLabel('First order only', { exact: true }).check();
  await page.getByLabel('Coupon expiry (your local time)').fill('2026-11-10T13:30');
  await page.getByRole('button', { name: 'Generate random coupon' }).click();
  await expect(page.getByText('LUVIA-0123456789ABCDEF', { exact: true })).toBeVisible();
  await expect(page.getByText(/Expires.*2026/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Disable coupon', exact: true }).click();
  await expect(page.getByText('Coupon disabled for new orders.', { exact: true })).toBeVisible();
  expect(coupons[0].enabled).toBe(false);

  await page.route('**/rest/v1/rpc/delete_campaign_coupon', async route => {
    expect(route.request().postDataJSON()).toEqual({ coupon_id: 'campaign' });
    coupons = coupons.filter(item => item.id !== 'campaign');
    await route.fulfill({ status: 204 });
  });
  page.once('dialog', dialog => { expect(dialog.message()).toContain('Delete coupon LUVIA-0123456789ABCDEF'); void dialog.accept(); });
  await page.getByRole('button', { name: 'Delete coupon LUVIA-0123456789ABCDEF' }).click();
  await expect(page.getByText('Coupon LUVIA-0123456789ABCDEF deleted.', { exact: true })).toBeVisible();
  await expect(page.getByText('LUVIA-0123456789ABCDEF', { exact: true })).toHaveCount(0);
  expect(coupons).toHaveLength(0);
});

test('used coupons can be archived and restored without losing usage or enabling new orders', async ({ page }) => {
  await installMockSupabase(page);
  const coupon = { id: 'used-coupon', code: 'LUVIA-USED', percent: 10, max_discount_rupees: 100,
    minimum_subtotal_rupees: 500, max_redemptions: 1, first_order_only: false, enabled: true,
    expires_at: '2026-11-10T13:30:00Z', archived_at: null as string | null, used_count: 1, reserved_count: 0 };
  await page.route('**/rest/v1/rpc/get_admin_campaign_coupons', route =>
    route.fulfill({ json: Boolean(coupon.archived_at) === route.request().postDataJSON().archived ? [coupon] : [] }));
  await page.route('**/rest/v1/rpc/set_campaign_coupon_archived', async route => {
    const body = route.request().postDataJSON();
    expect(body.coupon_id).toBe(coupon.id);
    coupon.archived_at = body.archive ? new Date().toISOString() : null;
    coupon.enabled = false;
    await route.fulfill({ json: coupon });
  });
  await page.goto('./#admin');
  await page.getByLabel('Email', { exact: true }).fill('admin@luvia.test');
  await page.getByLabel('Password').fill('test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Generate discount coupons' }).click();
  await expect(page.getByText('Usage: 1 of 1 used')).toBeVisible();
  await expect(page.getByText(/Expires.*Used/)).toBeVisible();
  await page.getByRole('button', { name: 'Archive coupon', exact: true }).click();
  await expect(page.getByText('LUVIA-USED', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Archived coupons', exact: true }).click();
  await expect(page.getByText(/Archived · Used/)).toBeVisible();
  await page.getByRole('button', { name: 'Restore coupon' }).click();
  await expect(page.getByRole('status')).toContainText('remains disabled');
  await page.getByRole('button', { name: 'Current coupons' }).click();
  await expect(page.getByText('Usage: 1 of 1 used')).toBeVisible();
  expect(coupon.enabled).toBe(false);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
