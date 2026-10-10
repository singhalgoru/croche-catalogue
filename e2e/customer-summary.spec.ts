import { expect, test } from '@playwright/test';
import { installMockSupabase } from './mockSupabase';

test('admin views registered customer counts and contact details', async ({ page }) => {
  await installMockSupabase(page);
  await page.route('**/rest/v1/rpc/get_admin_customer_summary', route => route.fulfill({ json: {
    total: 2, verified: 1, pendingActivation: 1, welcomeEmailsSent: 1,
    customers: [{ id: 'buyer', email: 'buyer@example.test', name: 'Test Buyer', phone: '9876543210',
      city: 'Delhi', pincode: '110001', registeredAt: '2026-10-10T12:00:00Z', lastSignInAt: null,
      verified: true, welcomeStatus: 'sent' },
    { id: 'pending', email: 'pending@example.test', name: 'Pending Buyer', phone: '9876543211',
      city: 'Delhi', pincode: '110001', registeredAt: '2026-10-10T12:00:00Z', lastSignInAt: null,
      verified: false, welcomeStatus: 'not_queued' }],
  } }));
  await page.goto('./#admin');
  await page.getByLabel('Email', { exact: true }).fill('admin@luvia.test');
  await page.getByLabel('Password').fill('test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Customers', exact: true }).click();
  const summary = page.getByRole('region', { name: 'Registered customers' });
  await expect(summary.getByText('Total customers', { exact: true }).locator('..')).toContainText('2');
  await expect(summary.getByText('Verified accounts', { exact: true }).locator('..')).toContainText('1');
  await expect(summary.getByText('Pending activation', { exact: true }).locator('..')).toContainText('1');
  await expect(summary.getByRole('article', { name: 'Customer buyer@example.test' })).toContainText('Welcome email: Sent');
  await expect(summary.getByRole('article', { name: 'Customer pending@example.test' })).toContainText('Awaiting activation');
});
