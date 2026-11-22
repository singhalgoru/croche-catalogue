import { expect, test } from '@playwright/test';
import { installMockSupabase } from './mockSupabase';

test('admin views registered customer counts and contact details', async ({ page }) => {
  await installMockSupabase(page);
  let suspended = false;
  let excluded = false;
  const changes: Record<string, unknown>[] = [];
  await page.route('**/functions/v1/manage-admin-users', async route => {
    const body = route.request().postDataJSON();
    changes.push(body);
    suspended = body.action === 'suspend-customer';
    await route.fulfill({ json: { message: suspended ? 'Customer account temporarily disabled.' : 'Customer account re-enabled.' } });
  });
  await page.route('**/rest/v1/rpc/set_customer_purchase_exclusion', route => {
    const body = route.request().postDataJSON();
    excluded = body.excluded;
    return route.fulfill({ json: body.target });
  });
  await page.route('**/rest/v1/rpc/get_admin_customer_summary', route => route.fulfill({ json: {
    total: 2, verified: 1, pendingActivation: 1, welcomeEmailsSent: 1, totalPurchases: excluded ? 0 : 3,
    customers: [{ id: '11111111-1111-4111-8111-111111111111', email: 'buyer@example.test', name: 'Test Buyer', phone: '9876543210',
      city: 'Delhi', pincode: '110001', registeredAt: '2026-10-10T12:00:00Z', lastSignInAt: null,
      verified: true, welcomeStatus: 'sent', suspended, canManageAccount: true, purchaseExcluded: excluded, purchaseCount: excluded ? null : 3 },
    { id: 'pending', email: 'pending@example.test', name: 'Pending Buyer', phone: '9876543211',
      city: 'Delhi', pincode: '110001', registeredAt: '2026-10-10T12:00:00Z', lastSignInAt: null,
      verified: false, welcomeStatus: 'not_queued', suspended: false, canManageAccount: false, purchaseExcluded: false, purchaseCount: 0 }],
  } }));
  await page.goto('./#admin');
  await page.getByLabel('Email', { exact: true }).fill('admin@luvia.test');
  await page.getByLabel('Password').fill('test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const picker = page.getByRole('combobox', { name: 'Jump to admin section' });
  const customers = page.getByRole('button', { name: 'Customers', exact: true });
  await expect(picker.or(customers)).toBeVisible();
  if (await picker.isVisible()) await picker.selectOption('Customers');
  else await customers.click();
  const summary = page.getByRole('region', { name: 'Registered customers' });
  await expect(summary.getByText('Total customers', { exact: true }).locator('..')).toContainText('2');
  await expect(summary.getByText('Verified accounts', { exact: true }).locator('..')).toContainText('1');
  await expect(summary.getByText('Pending activation', { exact: true }).locator('..')).toContainText('1');
  await expect(summary.getByRole('article', { name: 'Customer buyer@example.test' })).toContainText('Welcome email: Sent');
  await expect(summary.getByRole('article', { name: 'Customer pending@example.test' })).toContainText('Awaiting activation');
  const buyer = summary.getByRole('article', { name: 'Customer buyer@example.test' });
  await expect(buyer).toContainText('Purchases: 3');
  await buyer.getByRole('button', { name: 'Exclude test purchases' }).click();
  await expect(buyer).toContainText('Test account: purchases excluded');
  await expect(summary.getByText('Customer purchases', { exact: true }).locator('..')).toContainText('0');
  await buyer.getByRole('button', { name: 'Include purchases' }).click();
  await expect(buyer).toContainText('Purchases: 3');
  await buyer.getByRole('button', { name: 'Temporarily disable account' }).click();
  let access = summary.getByRole('form', { name: 'Customer account access' });
  await access.getByLabel('Reason (internal)').fill('Customer reported password fraud.');
  await access.getByLabel('Your current admin password').fill('test-password');
  await access.getByLabel('Show admin password').check();
  await expect(access.getByLabel('Your current admin password')).toHaveAttribute('type', 'text');
  await access.getByRole('button', { name: 'Confirm disable account' }).click();
  await expect(buyer).toContainText('Account access: Temporarily disabled');
  expect(changes[0]).toMatchObject({ action: 'suspend-customer', id: '11111111-1111-4111-8111-111111111111', reason: 'Customer reported password fraud.', currentPassword: 'test-password' });
  await buyer.getByRole('button', { name: 'Re-enable account' }).click();
  access = summary.getByRole('form', { name: 'Customer account access' });
  await expect(access.getByLabel('Your current admin password')).toHaveAttribute('type', 'password');
  await access.getByLabel('Reason (internal)').fill('Customer identity verified.');
  await access.getByLabel('Your current admin password').fill('test-password');
  await access.getByRole('button', { name: 'Confirm re-enable account' }).click();
  await expect(buyer).toContainText('Account access: Active');
  expect(changes[1]).toMatchObject({ action: 'restore-customer', id: '11111111-1111-4111-8111-111111111111' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
test('admin forgot password asks only for email', async ({ page }) => {
  await installMockSupabase(page);
  await page.goto('./#admin');
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  const form = page.getByRole('form', { name: 'Admin forgot password' });
  await expect(form.locator('input')).toHaveCount(1);
  await expect(form.getByLabel('Password', { exact: true })).toHaveCount(0);
  await form.getByLabel('Email', { exact: true }).fill('admin@luvia.test');
  await form.getByRole('button', { name: 'Send reset link' }).click();
  await expect(form.getByRole('status')).toContainText('If an account exists');
});
