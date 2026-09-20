import { expect, test, type Page } from '@playwright/test';
import { installMockSupabase } from './mockSupabase';

const signIn = async (page: Page) => {
  await page.goto('./#admin', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Email').fill('admin@luvia.test');
  await page.getByLabel('Password').fill('test-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Manage catalogue' })).toBeVisible();
};

test('authenticates and manages the complete category lifecycle', async ({ page }) => {
  const state = await installMockSupabase(page);
  await signIn(page);

  await page.getByLabel('New category').fill('Bags');
  await page.getByRole('button', { name: 'Add category' }).click();
  await expect(page.getByText('“Bags” was added.')).toBeVisible();
  expect(state.categories).toContain('Bags');

  const bagsRow = page.getByText('Bags', { exact: true }).locator('..');
  await bagsRow.getByRole('button', { name: 'Rename' }).click();
  await page.getByLabel('Rename category').fill('Tote Bags');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('“Bags” was renamed to “Tote Bags”.')).toBeVisible();
  expect(state.categories).toContain('Tote Bags');
  expect(state.categories).not.toContain('Bags');

  const renamedRow = page.getByText('Tote Bags', { exact: true }).locator('..');
  await renamedRow.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Yes, delete' }).click();
  await expect(page.getByText('“Tote Bags” was deleted.')).toBeVisible();
  expect(state.categories).not.toContain('Tote Bags');
});

test('uses Gemini suggestions to publish a product', async ({ page }) => {
  const state = await installMockSupabase(page);
  await signIn(page);

  await page.getByLabel('Variant image').setInputFiles({
    name: 'bunny.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4l8AAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await page.getByRole('button', { name: 'Generate details with Gemini' }).click();
  await expect(page.getByLabel('Product name')).toHaveValue('AI Bunny');
  await expect(page.getByLabel('Description')).toHaveValue(
    'A soft handmade crochet bunny suggested by Gemini.',
  );

  await page.getByRole('button', { name: 'Publish product' }).click();
  await expect(page.getByText('AI Bunny with 1 variant was published to the catalogue.')).toBeVisible();
  expect(state.products.some((product) => product.name === 'AI Bunny')).toBe(true);
  expect(
    state.products.find((product) => product.name === 'AI Bunny')?.product_variants,
  ).toHaveLength(1);
  await expect(
    page.getByRole('heading', { name: 'AI Bunny', exact: true }),
  ).toBeVisible();
});

test('edits visibility and permanently removes products', async ({ page }) => {
  const state = await installMockSupabase(page);
  await signIn(page);

  const rose = page.locator('article').filter({
    has: page.getByRole('heading', { name: 'Rose Charm', exact: true }),
  });
  await rose.getByRole('button', { name: 'Edit' }).click();
  await rose.getByLabel('Product name').fill('Rose Bag Charm');
  await rose.getByLabel('Visible in catalogue').uncheck();
  await rose.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Rose Bag Charm was updated.')).toBeVisible();
  expect(state.products.find((product) => product.id === 'product-1')).toMatchObject({
    name: 'Rose Bag Charm',
    published: false,
  });

  const coaster = page.locator('article').filter({
    has: page.getByRole('heading', { name: 'Flower Coaster', exact: true }),
  });
  await coaster.getByRole('button', { name: 'Remove' }).click();
  await coaster.getByRole('button', { name: 'Yes, remove' }).click();
  await expect(page.getByText('Flower Coaster was removed from the catalogue.')).toBeVisible();
  expect(state.products.some((product) => product.id === 'product-2')).toBe(false);
  await expect(
    page.getByRole('heading', { name: 'Flower Coaster', exact: true }),
  ).toHaveCount(0);
});

test('adds, updates, and removes product variants', async ({ page }) => {
  const state = await installMockSupabase(page);
  await signIn(page);

  const rose = page.locator('article').filter({
    has: page.getByRole('heading', { name: 'Rose Charm', exact: true }),
  });
  await rose.getByRole('button', { name: 'Edit' }).click();
  await rose.getByRole('button', { name: '+ Add variant' }).click();
  const newVariant = rose.getByRole('heading', { name: 'New variant' }).locator('..');
  await newVariant.getByLabel('Variant name').fill('Lavender');
  await newVariant.getByLabel('Variant image').setInputFiles({
    name: 'lavender.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4l8AAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await newVariant.getByRole('button', { name: 'Add variant' }).click();
  await expect(page.getByText('“Lavender” was added to Rose Charm.')).toBeVisible();
  expect(state.products[0].product_variants).toHaveLength(3);

  const lavender = rose.getByRole('group', { name: 'Lavender variant' });
  await lavender.getByRole('button', { name: 'Edit' }).click();
  await lavender.getByLabel('Variant name').fill('Lilac');
  await lavender.getByLabel('In stock').uncheck();
  await lavender.getByRole('button', { name: 'Save variant' }).click();
  await expect(page.getByText('“Lilac” was updated.')).toBeVisible();

  const lilac = rose.getByRole('group', { name: 'Lilac variant' });
  await lilac.getByRole('button', { name: 'Remove' }).click();
  await lilac.getByRole('button', { name: 'Yes, remove' }).click();
  await expect(page.getByText('“Lilac” was removed from Rose Charm.')).toBeVisible();
  expect(state.products[0].product_variants).toHaveLength(2);
});
