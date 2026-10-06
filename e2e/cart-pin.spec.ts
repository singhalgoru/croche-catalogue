import { expect, test } from '@playwright/test';
import { installMockSupabase } from './mockSupabase';

test('optional cart PIN persists, is shared only after save, and can be cleared', async ({ page, isMobile }) => {
  if (isMobile) await page.setViewportSize({ width: 360, height: 780 });
  const state = await installMockSupabase(page);
  await page.goto('/');
  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Rose Charm', exact: true }) });
  await card.getByRole('button', { name: 'Add to cart — Rose Charm' }).click();
  await page.getByRole('button', { name: 'Open cart with 1 item' }).click();
  const input = page.getByLabel('Delivery PIN code (optional)');
  const pinPanel = page.locator('form').filter({ has: input });
  const initialBox = await pinPanel.boundingBox();
  expect(initialBox!.height).toBeLessThanOrEqual(180);
  await expect(page.getByText(/Only your PIN is sent/)).not.toBeVisible();
  await input.fill('000000');
  await page.getByRole('button', { name: 'Save PIN' }).click();
  await expect(page.getByRole('alert')).toContainText('6-digit');
  expect(state.carts[0].delivery_pin_code).toBeUndefined();
  await input.fill('999999');
  await page.getByRole('button', { name: 'Save PIN' }).click();
  await expect(page.getByRole('dialog', { name: 'Shopping cart' }).getByText('Enter a valid PIN code or keep it empty.')).toBeVisible();
  expect(state.carts[0].delivery_pin_code).toBeUndefined();
  await input.fill('110001');
  const enquiry = page.getByRole('link', { name: 'Send cart to Luvia on WhatsApp' });
  expect(new URL((await enquiry.getAttribute('href'))!).searchParams.get('text')).not.toContain('110001');
  await page.getByRole('button', { name: 'Save PIN' }).click();
  await expect(page.getByRole('dialog', { name: 'Shopping cart' }).getByRole('status')).toContainText('Delivery PIN code saved.');
  expect(state.carts[0].delivery_pin_code).toBe('110001');
  await expect(input).toHaveCount(0);
  const savedPanel = page.locator('form').filter({ has: page.getByRole('button', { name: 'Change PIN' }) });
  expect((await savedPanel.boundingBox())!.height).toBeLessThanOrEqual(160);
  const panelBox = (await savedPanel.boundingBox())!;
  for (const name of ['Change PIN', 'Clear PIN']) {
    const buttonBox = (await savedPanel.getByRole('button', { name }).boundingBox())!;
    expect(buttonBox.height).toBeGreaterThanOrEqual(44);
    expect(buttonBox.x + buttonBox.width).toBeLessThanOrEqual(panelBox.x + panelBox.width);
  }
  await expect(page.getByText(/Postal area: Central Delhi · Delhi · India/)).toBeVisible();
  expect(new URL((await enquiry.getAttribute('href'))!).searchParams.get('text')).toContain('Delivery PIN code (shopper-provided): 110001');
  await page.reload();
  await page.getByRole('button', { name: 'Open cart with 1 item' }).click();
  await expect(page.getByText('Delivery PIN: 110001', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Change PIN' }).click();
  await expect(input).toHaveValue('110001');
  await input.fill('999999');
  await page.getByRole('button', { name: 'Save PIN' }).click();
  await expect(page.getByRole('alert')).toContainText('Enter a valid PIN code or keep it empty.');
  expect(state.carts[0].delivery_pin_code).toBe('110001');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByText('How we use your PIN', { exact: true }).click();
  await expect(page.getByText(/Only your PIN is sent/)).toBeVisible();
  await page.getByRole('button', { name: 'Clear PIN' }).click();
  await expect(page.getByRole('dialog', { name: 'Shopping cart' }).getByRole('status')).toContainText('Delivery PIN code cleared.');
  expect(state.carts[0].delivery_pin_code).toBeNull();
  expect(state.carts[0].delivery_pin_location).toBeNull();
  await expect(input).toHaveValue('');
  expect(new URL((await page.getByRole('link', { name: 'Send cart to Luvia on WhatsApp' }).getAttribute('href'))!).searchParams.get('text')).not.toContain('Delivery PIN code');
});

test('quick view and image zoom cover the hamburger and restore it after closing', async ({ page }) => {
  await installMockSupabase(page);
  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Open navigation' });
  const box = await menu.boundingBox();
  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Rose Charm', exact: true }) });
  await card.getByRole('button', { name: 'View Rose Charm', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Rose Charm', exact: true })).toBeVisible();
  const menuCovered = async () => page.evaluate(({ x, y }) => !document.elementFromPoint(x, y)?.closest('button[aria-label="Open navigation"]'),
    { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 });
  expect(await menuCovered()).toBe(true);
  await page.getByRole('button', { name: 'Open zoomed product image' }).click();
  expect(await menuCovered()).toBe(true);
  await page.getByRole('button', { name: /Close.*(image|zoom)/i }).click();
  await page.getByRole('button', { name: 'Close product details' }).click();
  await expect(menu).toBeVisible();
  await menu.click();
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
});
