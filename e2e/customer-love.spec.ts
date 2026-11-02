import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { installMockSupabase } from './mockSupabase';

test('late-loading customer stories preserve product section anchor alignment', async ({ page }) => {
  await installMockSupabase(page);
  await page.route('**/rest/v1/rpc/list_customer_love', async route => {
    await new Promise(resolve => setTimeout(resolve, 700));
    await route.fulfill({ json: [{ id: '10000000-0000-4000-8000-000000000001', display_name: 'Synthetic late story',
      quote: 'A lovely handmade gift that arrived after the catalogue loaded.', product_id: null,
      has_image: false, image_alt: '', featured: true, sort_order: 0 }] });
  });
  await page.goto('./#products');
  await expect(page.getByText('Synthetic late story', { exact: true })).toBeVisible();
  await expect.poll(() => page.locator('#products').evaluate(element =>
    Math.abs(element.getBoundingClientRect().top - parseFloat(getComputedStyle(element).scrollMarginTop)))).toBeLessThan(3);
});

test('admin drafts and publishes a permission-based photo story, then withdraws it from the website', async ({ page }) => {
  const catalogue = await installMockSupabase(page);
  const entries: Record<string, unknown>[] = [];
  const photos = new Map<string, string>();
  await page.route('**/rest/v1/rpc/list_customer_love', async route => {
    const admin = route.request().postDataJSON().admin_view;
    await route.fulfill({ json: admin ? entries : entries.filter(entry => entry.published && entry.consent_confirmed)
      .map(({ published: _published, consent_confirmed: _consent, consent_date: _date, consent_source: _source, version: _version, ...entry }) => entry) });
  });
  await page.route('**/rest/v1/rpc/save_customer_love', async route => {
    const body = route.request().postDataJSON();
    const previous = entries.find(entry => entry.id === body.testimonial_id);
    expect(body.expected_version).toBe(previous?.version ?? 0);
    const saved = { ...body.entry, version: body.expected_version + 1 };
    if (previous) Object.assign(previous, saved); else entries.push(saved);
    if (body.photo_base64) photos.set(saved.id, body.photo_base64);
    await route.fulfill({ json: body.testimonial_id });
  });
  await page.route('**/rest/v1/rpc/customer_love_photo', async route => {
    await route.fulfill({ json: photos.get(route.request().postDataJSON().testimonial_id) ?? null });
  });
  await page.route('**/functions/v1/customer-love-image*', async route => {
    const id = new URL(route.request().url()).searchParams.get('id')!;
    const image = photos.get(id);
    if (image && entries.some(entry => entry.id === id && entry.published)) {
      await route.fulfill({ body: Buffer.from(image, 'base64'), contentType: 'image/webp' });
    } else await route.fulfill({ status: 404 });
  });
  await page.goto('./#admin');
  await page.getByLabel('Email', { exact: true }).fill('admin@luvia.test');
  await page.getByLabel('Password', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Customer Love', exact: true }).click();
  await page.getByRole('button', { name: 'Add testimonial', exact: true }).click();
  await page.getByLabel('Customer display name').fill('Synthetic customer');
  await page.getByLabel('Customer quote').fill('A thoughtful handmade gift that makes me smile.');
  await page.getByLabel('Related product').selectOption(catalogue.products[0].id);
  const photo = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#f3cf74' } })
    .jpeg().withMetadata({ exif: { IFD0: { Artist: 'Synthetic private metadata' } } }).toBuffer();
  await page.getByLabel('Customer photo (optional)').setInputFiles({ name: 'synthetic-photo.jpg', mimeType: 'image/jpeg', buffer: photo });
  await page.getByLabel('Photo description').fill('Synthetic yellow photo used for testing');
  await expect(page.getByRole('dialog').getByRole('blockquote')).toContainText('A thoughtful handmade gift');
  await page.getByRole('button', { name: 'Save testimonial', exact: true }).click();
  await expect(page.getByText('Testimonial saved as a private draft.')).toBeVisible();
  expect((await sharp(Buffer.from([...photos.values()][0], 'base64')).metadata()).exif).toBeUndefined();
  await page.goto('./customer-love/');
  await expect(page.getByRole('heading', { name: 'Customer Love', exact: true })).toBeVisible();
  await expect(page.getByText('Synthetic customer', { exact: true })).toHaveCount(0);
  await page.goto('./#admin');
  await page.getByRole('button', { name: 'Customer Love', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Synthetic customer', exact: true }).click();
  await page.getByLabel('Visibility').selectOption('published');
  await page.getByRole('button', { name: 'Save testimonial', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Record permission');
  await page.getByLabel(/Customer explicitly permitted/).check();
  await page.getByLabel('Permission date').fill('2026-01-01');
  await page.getByLabel('Permission source (private)').fill('Synthetic permission for testing');
  await page.getByLabel('Feature on homepage').check();
  await page.getByRole('button', { name: 'Save testimonial', exact: true }).click();
  await expect(page.getByText('Testimonial published.')).toBeVisible();
  await page.goto('./customer-love/');
  await expect(page.getByText('Synthetic customer', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: `Shop ${catalogue.products[0].name}`, exact: true })).toBeVisible();
  await expect(page.getByAltText('Synthetic yellow photo used for testing')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('link', { name: `Shop ${catalogue.products[0].name}`, exact: true }).click();
  await expect(page.getByRole('heading', { name: catalogue.products[0].name, level: 1 })).toBeVisible();
  await expect(page.getByText('Synthetic customer', { exact: true })).toBeVisible();
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Customer Love', exact: true })).toBeVisible();
  await page.goto('./#admin');
  await page.getByRole('button', { name: 'Customer Love', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Synthetic customer', exact: true }).click();
  await page.getByLabel(/Customer explicitly permitted/).uncheck();
  await expect(page.getByLabel('Visibility')).toHaveValue('draft');
  await page.getByRole('button', { name: 'Save testimonial', exact: true }).click();
  await expect(page.getByText('Testimonial saved as a private draft.')).toBeVisible();
  await page.goto('./customer-love/');
  await expect(page.getByText('Synthetic customer', { exact: true })).toHaveCount(0);
});
