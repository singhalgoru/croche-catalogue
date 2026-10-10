import { expect, test } from '@playwright/test';
import { installMockSupabase } from './mockSupabase';

test('guest address is saved, reviewed, shared and restored without showing payment', async ({ page }) => {
  const state = await installMockSupabase(page);
  await page.route('**/rest/v1/welcome_offer*', route => route.fulfill({ json: {
    id: true, enabled: false, percent: 10, max_discount_rupees: 100, minimum_subtotal_rupees: 500, valid_days: 30,
  } }));
  await page.route('**/rest/v1/rpc/save_cart_delivery_details', async route => {
    const body = route.request().postDataJSON();
    const cart = state.carts.find(cart => cart.id === body.target_cart_id);
    expect(cart).toBeDefined();
    if (cart) Object.assign(cart, { cart_delivery_details: { details: body.delivery, welcome_coupons: null } });
    await route.fulfill({ json: body.delivery });
  });
  await page.goto('./');
  await page.getByRole('article', { name: 'Product: Rose Charm' })
    .getByRole('button', { name: 'Add to cart — Rose Charm' }).click();
  await page.getByRole('button', { name: 'Open cart with 1 item', exact: true }).click();
  await page.getByRole('button', { name: 'Continue with delivery details' }).click();
  await page.getByLabel('Recipient name').fill('Guest Buyer');
  await page.getByLabel('Mobile number', { exact: true }).fill('9876543210');
  await page.getByRole('button', { name: 'Continue to address' }).click();
  await page.getByLabel('House / building and street').fill('12 Guest Street');
  await page.getByLabel('City', { exact: true }).fill('New Delhi');
  await page.getByLabel('State', { exact: true }).fill('Delhi');
  await page.getByRole('region', { name: 'Order details' }).getByLabel('Pincode', { exact: true }).fill('110001');
  await page.getByRole('button', { name: 'Save and review' }).click();
  await expect(page.getByText('3. Review order request', { exact: true })).toBeVisible();
  await expect(page.getByText(/12 Guest Street/)).toBeVisible();
  const whatsapp = await page.getByRole('link', { name: 'Send cart to Luvia on WhatsApp' }).getAttribute('href');
  expect(decodeURIComponent(whatsapp!)).toContain('12 Guest Street');
  await expect(page.getByRole('button', { name: 'Try Razorpay test checkout' })).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'Open cart with 1 item', exact: true }).click();
  await page.getByRole('button', { name: 'Review delivery details' }).click();
  await expect(page.getByText(/12 Guest Street/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Email my welcome coupon' })).toHaveCount(0);
});
