import { expect, test } from '@playwright/test';
import { installMockSupabase } from './mockSupabase';

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
  // Explicit saves survive the automatic recovery draft's seven-day expiry.
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('luvia-admin', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('drafts', 'readwrite');
        const store = tx.objectStore('drafts');
        const cursor = store.openCursor();
        cursor.onsuccess = () => {
          const row = cursor.result;
          if (!row) return;
          row.update({ ...row.value, savedAt: Date.now() - 30 * 86400000 });
          row.continue();
        };
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onabort = () => { db.close(); reject(tx.error); };
      };
    });

  });
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

test('aborted storage writes do not report draft success or discard the form', async ({ page }) => {
  await installMockSupabase(page);
  await page.goto('./#admin');
  await page.getByLabel('Email', { exact: true }).fill('admin@luvia.test');
  await page.getByLabel('Password').fill('test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: /Add product/ }).click();
  const form = page.getByRole('dialog', { name: 'Add product', exact: true });
  await form.getByLabel('Product name', { exact: false }).fill('Keep this work');
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      const request = original.call(this, value, key);
      if (typeof key === 'string' && key.startsWith('saved:')) this.transaction.abort();
      return request;
    };
  });
  await form.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(form.getByRole('alert')).toBeVisible();
  await expect(form.getByLabel('Product name', { exact: false })).toHaveValue('Keep this work');
  await expect(page.getByText('Draft saved on this browser. Open Drafts to continue.')).toHaveCount(0);
});
