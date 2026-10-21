import { expect, test } from '@playwright/test';
import { createMockDraftStorage, installMockSupabase } from './mockSupabase';

test('drafts and photos are shared between isolated browser sessions without reloading', async ({ page, browser, baseURL }) => {
  const storage = createMockDraftStorage();
  const otherContext = await browser.newContext({ baseURL });
  try {
    const otherPage = await otherContext.newPage();
    for (const device of [page, otherPage]) {
      await installMockSupabase(device, storage);
      await device.goto('./#admin');
      await device.getByLabel('Email', { exact: true }).fill('admin@luvia.test');
      await device.getByLabel('Password').fill('test-password');
      await device.getByRole('button', { name: 'Sign in', exact: true }).click();
      await expect(device.getByRole('button', { name: 'Drafts (0)', exact: true })).toBeVisible();
    }

    await page.getByRole('button', { name: /Add product/ }).click();
    const form = page.getByRole('dialog', { name: 'Add product', exact: true });
    await form.getByLabel('Product name', { exact: false }).fill('Shared bunny');
    await form.locator('input[type=file]').first().setInputFiles({
      name: 'bunny.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4l8AAAAASUVORK5CYII=', 'base64'),
    });
    await form.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Drafts (1)', exact: true })).toBeVisible();

    await otherPage.getByRole('button', { name: 'Drafts (0)', exact: true }).click();
    await otherPage.getByRole('button', { name: 'Continue Shared bunny', exact: true }).click();
    const otherForm = otherPage.getByRole('dialog', { name: 'Add product', exact: true });
    await expect(otherForm.getByLabel('Product name', { exact: false })).toHaveValue('Shared bunny');
    await expect(otherForm.locator('img[src^="blob:"]').first()).toBeVisible();
    await otherForm.getByLabel('Product name', { exact: false }).fill('Finished bunny');
    await otherForm.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(otherPage.getByRole('button', { name: 'Drafts (1)', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Drafts (1)', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Continue Finished bunny', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue Shared bunny', exact: true })).toHaveCount(0);
  } finally {
    await otherContext.close();
  }
});

test('admin saves incomplete drafts with photos, resumes after reload and updates without duplicates', async ({ page }) => {
  await installMockSupabase(page);
  await page.goto('./#admin');
  await page.getByLabel('Email', { exact: true }).fill('admin@luvia.test');
  await page.getByLabel('Password').fill('test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: /Add product/ }).click();
  const form = page.getByRole('dialog', { name: 'Add product', exact: true });
  await form.getByLabel('Product name', { exact: false }).fill('Unfinished bunny');
  const photo = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4l8AAAAASUVORK5CYII=', 'base64');
  await form.locator('input[type=file]').first().setInputFiles({
    name: 'bunny.png', mimeType: 'image/png', buffer: photo,
  });

  await form.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Drafts (1)', exact: true })).toBeVisible();

  await page.getByRole('button', { name: /Add product/ }).click();
  await form.getByLabel('Product name', { exact: false }).fill('Second idea');
  await form.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Drafts (2)', exact: true })).toBeVisible();
  // Shared drafts survive clearing this browser's recovery data.
  await page.evaluate(() => new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase('luvia-admin');
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  }));
  await page.reload();
  await page.getByRole('button', { name: 'Drafts (2)', exact: true }).click();
  await page.getByRole('button', { name: 'Continue Unfinished bunny', exact: true }).click();
  await expect(form.getByLabel('Product name', { exact: false })).toHaveValue('Unfinished bunny');
  await expect(form.locator('img[src^="blob:"]').first()).toBeVisible();
  await form.getByLabel('Product name', { exact: false }).fill('Edited bunny');
  await form.getByRole('button', { name: 'Save draft', exact: true }).click();
  await page.getByRole('button', { name: 'Drafts (2)', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Continue Unfinished bunny', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Continue Edited bunny', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Delete Second idea', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Continue Second idea', exact: true })).toHaveCount(0);
});

test('failed shared draft saves do not report success or discard the form', async ({ page }) => {
  await installMockSupabase(page);
  await page.goto('./#admin');
  await page.getByLabel('Email', { exact: true }).fill('admin@luvia.test');
  await page.getByLabel('Password').fill('test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: /Add product/ }).click();
  const form = page.getByRole('dialog', { name: 'Add product', exact: true });
  await form.getByLabel('Product name', { exact: false }).fill('Keep this work');
  await page.route('http://supabase.test/rest/v1/product_drafts*', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Database offline' }) })
      : route.fallback());
  await form.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('Database offline');
  await expect(form.getByLabel('Product name', { exact: false })).toHaveValue('Keep this work');
  await expect(page.getByText(/Draft saved for all admins/)).toHaveCount(0);
});