import { expect, test, type Page } from '@playwright/test';
import { installMockSupabase } from './mockSupabase';

const signIn = async (page: Page) => {
  await page.goto('./#admin', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Email').fill('admin@luvia.test');
  await page.getByLabel('Password').fill('test-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Manage catalogue' })).toBeVisible();
  expect(
    await page.evaluate(() => ({
      hasGtag: typeof window.gtag === 'function',
      scriptCount: document.querySelectorAll('script[src*="googletagmanager.com/gtag"]').length,
    })),
  ).toEqual({ hasGtag: false, scriptCount: 0 });
};

const expectNoHorizontalOverflow = async (page: Page) => {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
};

test('authenticates and manages the complete category lifecycle', async ({ page }) => {
  const state = await installMockSupabase(page);
  await signIn(page);

  await page.getByRole('button', { name: /Manage categories/ }).click();
  const charmsDisplay = page.getByLabel('Priority for Charms').locator('..').locator('..');
  await page.getByLabel('Priority for Charms').fill('5');
  await charmsDisplay.getByRole('button', { name: 'Save display' }).click();
  await expect(page.getByText('“Charms” priority was updated to 5.')).toBeVisible();
  expect(state.categorySettings.Charms).toEqual({ priority: 5 });

  await page.getByLabel('New category').fill('Bags');
  await page.getByRole('button', { name: 'Add category' }).click();
  await expect(page.getByText('“Bags” was added.')).toBeVisible();
  expect(state.categories).toContain('Bags');

  const bagsRow = page.getByLabel('Priority for Bags').locator('..').locator('..').locator('..');
  await bagsRow.getByRole('button', { name: 'Rename' }).click();
  await page.getByLabel('Rename category').fill('Tote Bags');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('“Bags” was renamed to “Tote Bags”.')).toBeVisible();
  expect(state.categories).toContain('Tote Bags');
  expect(state.categories).not.toContain('Bags');

  const renamedRow = page
    .getByLabel('Priority for Tote Bags')
    .locator('..')
    .locator('..')
    .locator('..');
  await renamedRow.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Yes, delete' }).click();
  await expect(page.getByText('“Tote Bags” was deleted.')).toBeVisible();
  expect(state.categories).not.toContain('Tote Bags');
});

test('uses Gemini suggestions to publish a product', async ({ page }) => {
  const state = await installMockSupabase(page);
  await signIn(page);

  await page.getByLabel('Variant image').setInputFiles({
    name: 'a-very-long-crochet-product-image-filename-for-mobile-testing.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4l8AAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await expectNoHorizontalOverflow(page);
  await page.getByRole('button', { name: 'Warm minimal' }).click();
  const rawPrompt = [
    'Add soft morning light.',
    'Use a small handmade wooden basket, premium cream linen, natural shadows,',
    'a cosy craft-market feeling, subtle festive gift styling, botanical accents,',
    'and a polished catalogue look while keeping the crochet item exactly the same.',
    'Make it feel elegant for an Indian handmade brand and suitable for a product listing.',
  ].join(' ');
  expect(rawPrompt.length).toBeGreaterThan(300);
  await page.getByLabel('Optional instruction').fill(rawPrompt);
  const optimizeRequest = page.waitForRequest('**/functions/v1/optimize-image-prompt');
  await page.getByRole('button', { name: 'Optimize prompt with Gemini' }).click();
  expect((await optimizeRequest).postDataJSON()).toMatchObject({
    styleDirection: `Use a warm cream palette, soft natural light, and very minimal neutral props. ${rawPrompt}`,
  });
  await expect(page.getByLabel('Optional instruction')).toHaveValue(
    'Style on warm cream linen with soft morning light, subtle handmade gift props, and a premium crochet catalogue look.',
  );
  const generationRequest = page.waitForRequest('**/functions/v1/enhance-product-image');
  await page.getByRole('button', { name: 'Create studio image' }).click();
  expect((await generationRequest).postDataJSON()).toMatchObject({
    mode: 'studio',
    styleSuggestion:
      'Style on warm cream linen with soft morning light, subtle handmade gift props, and a premium crochet catalogue look.',
  });
  const originalPreview = page.getByRole('img', { name: 'Original product' });
  await expect(originalPreview).toBeVisible();
  await expect.poll(() => originalPreview.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0);
  await expect(page.getByRole('img', { name: 'AI generated product preview' })).toBeVisible();
  await page.getByRole('button', { name: 'Use this image' }).click();
  await expect(page.getByText(/luvia-studio-\d+\.png/)).toBeVisible();
  await page.getByRole('button', { name: 'Suggest details from photo' }).click();
  await expect(page.getByLabel('Product name')).toHaveValue('AI Bunny');
  await expect(page.getByLabel('Description')).toHaveValue(
    'A soft handmade crochet bunny suggested by Gemini.',
  );
  await page.getByLabel('Feature this product at the top of the catalogue').check();

  await page.getByRole('button', { name: 'Publish product' }).click();
  await expect(page.getByText('AI Bunny with 1 variant was published to the catalogue.')).toBeVisible();
  expect(state.products.some((product) => product.name === 'AI Bunny')).toBe(true);
  expect(state.products.find((product) => product.name === 'AI Bunny')?.featured).toBe(true);
  expect(state.products.find((product) => product.name === 'AI Bunny')?.image_path).toMatch(
    /\.webp$/,
  );
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
  await rose.getByLabel('Featured product').uncheck();
  await rose.getByLabel('Visible in catalogue').uncheck();
  await rose.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Rose Bag Charm was updated.')).toBeVisible();
  expect(state.products.find((product) => product.id === 'product-1')).toMatchObject({
    name: 'Rose Bag Charm',
    published: false,
    featured: false,
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

test('controls product price visibility from the admin console', async ({ page }) => {
  const state = await installMockSupabase(page);
  await signIn(page);

  const coaster = page.locator('article').filter({
    has: page.getByRole('heading', { name: 'Flower Coaster', exact: true }),
  });
  await expect(coaster.getByText('₹249 (hidden)')).toBeVisible();

  await coaster.getByRole('button', { name: 'Edit' }).click();
  await coaster.getByLabel('Price (₹)').fill('299');
  await coaster.getByLabel('Show price in catalogue').check();
  await coaster.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Flower Coaster was updated.')).toBeVisible();
  expect(state.products.find((product) => product.id === 'product-2')).toMatchObject({
    price: 299,
    show_price: true,
  });

  // A price cannot be shown before one is entered.
  const heart = page.locator('article').filter({
    has: page.getByRole('heading', { name: 'New Heart Charm', exact: true }),
  });
  await heart.getByRole('button', { name: 'Edit' }).click();
  await heart.getByLabel('Show price in catalogue').check();
  await heart.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Add a price before showing it in the catalogue.')).toBeVisible();
  expect(state.products.find((product) => product.id === 'product-3')?.show_price).toBe(false);
});

test('reorders variants and additional angle photos', async ({ page }) => {
  const state = await installMockSupabase(page);
  await signIn(page);

  const rose = page.locator('article').filter({
    has: page.getByRole('heading', { name: 'Rose Charm', exact: true }),
  });
  await rose.getByRole('button', { name: 'Edit' }).click();

  const ivory = rose.getByRole('group', { name: 'Ivory variant' });
  await ivory.getByRole('button', { name: 'Up' }).click();
  await expect(page.getByText('Updated the variant order for Rose Charm.')).toBeVisible();
  expect(state.products[0].product_variants.find((variant) => variant.id === 'variant-2'))
    .toMatchObject({ sort_order: 0 });
  expect(state.products[0].product_variants.find((variant) => variant.id === 'variant-1'))
    .toMatchObject({ sort_order: 1 });
  expect(state.products[0].image_path).toBe('seed/rose-ivory.jpg');

  const rosePink = rose.getByRole('group', { name: 'Rose Pink variant' });
  await rosePink.getByLabel('Add an additional photo to Rose Pink').setInputFiles({
    name: 'angle-2.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4l8AAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await rosePink.getByRole('button', { name: 'Upload angle photo' }).click();
  await expect(page.getByText('Added an angle photo to “Rose Pink”.')).toBeVisible();

  await rosePink.getByLabel('Move additional photo 2 left for Rose Pink').click();
  await expect(page.getByText('Updated the angle photo order for “Rose Pink”.')).toBeVisible();
  const gallery = state.products[0].product_variants.find(
    (variant) => variant.id === 'variant-1',
  )!.product_variant_images;
  expect(gallery.find((image) => image.id === 'gallery-1')).toMatchObject({ sort_order: 1 });
  expect(gallery.find((image) => image.id !== 'gallery-1')).toMatchObject({ sort_order: 0 });
});

test('adds, updates, and removes product variants', async ({ page }) => {
  const state = await installMockSupabase(page);
  await signIn(page);

  const rose = page.locator('article').filter({
    has: page.getByRole('heading', { name: 'Rose Charm', exact: true }),
  });
  await rose.getByRole('button', { name: 'Edit' }).click();
  await rose.getByRole('button', { name: '+ Add variant' }).click();
  await expectNoHorizontalOverflow(page);
  const newVariant = rose.getByRole('heading', { name: 'New variant' }).locator('..');
  await newVariant.getByLabel('Variant name').fill('Lavender');
  await expect(newVariant.getByLabel('Colour').first()).toHaveValue('#a78bfa');
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

test('promotes a gallery photo to the main image without losing it, and removes gallery photos', async ({
  page,
}) => {
  const state = await installMockSupabase(page);
  await signIn(page);

  const rose = page.locator('article').filter({
    has: page.getByRole('heading', { name: 'Rose Charm', exact: true }),
  });
  await rose.getByRole('button', { name: 'Edit' }).click();

  const rosePink = rose.getByRole('group', { name: 'Rose Pink variant' });
  const variantRow = () => state.products[0].product_variants.find((v) => v.id === 'variant-1')!;

  // Seeded with one gallery photo up front (see mockSupabase defaultProducts).
  expect(variantRow().product_variant_images).toHaveLength(1);

  await rosePink.getByLabel('Add an additional photo to Rose Pink').setInputFiles({
    name: 'angle-2.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4l8AAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await expect(rosePink.getByText('New angle photo ready')).toBeVisible();
  await rosePink.getByRole('button', { name: 'Upload angle photo' }).click();
  await expect(page.getByText('Added an angle photo to “Rose Pink”.')).toBeVisible();
  expect(variantRow().product_variant_images).toHaveLength(2);

  const mainImagePathBeforeSwap = variantRow().image_path;
  const galleryImagePathBeforeSwap = variantRow().product_variant_images[0].image_path;
  expect(galleryImagePathBeforeSwap).toBe('seed/rose-angle.jpg');

  await rosePink.locator('button[aria-label^="Set additional photo"]').first().click();
  await expect(page.getByText('Updated the main photo for “Rose Pink”.')).toBeVisible();

  // The gallery photo becomes the main image...
  expect(variantRow().image_path).toBe(galleryImagePathBeforeSwap);
  // ...and the previous main image now lives in the gallery instead of being
  // lost, so the gallery still has the same number of photos.
  expect(variantRow().product_variant_images).toHaveLength(2);
  expect(variantRow().product_variant_images.map((item) => item.image_path)).toContain(
    mainImagePathBeforeSwap,
  );

  await rosePink.locator('button[aria-label^="Remove additional photo"]').first().click();
  await expect(page.getByText('Removed a photo from “Rose Pink”.')).toBeVisible();
  expect(variantRow().product_variant_images).toHaveLength(1);
});
