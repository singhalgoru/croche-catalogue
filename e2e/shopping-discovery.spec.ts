import { expect, test } from '@playwright/test';
import { installMockSupabase } from './mockSupabase';

test('homepage collections auto-rotate in a compact carousel above bestsellers and the catalogue', async ({ page }) => {
  const state = await installMockSupabase(page);
  for (const product of state.products.slice(0, 2)) {
    product.product_variants[0].in_stock = true;
    product.product_variants[0].available_quantity = 2;
  }
  const names = ['Festive', 'Gifts', 'Toys', 'Flowers', 'Bags', 'Accessories', 'Decor', 'Keepsakes'];
  for (const name of names) {
    state.categories.push(name);
    state.categorySettings[name] = { priority: 1, isSeasonal: true, productIds: [state.products[0].id],
      coverImage: 'https://images.luviacreations.com/products/admin/season.webp' };
  }
  await page.route('**/rest/v1/rpc/get_catalogue_bestsellers', route =>
    route.fulfill({ json: [{ product_id: 'product-1' }, { product_id: 'product-2' }] }));
  await page.goto('/');
  const collections = page.getByRole('navigation', { name: 'Explore collections' });
  await expect(collections).toHaveCount(1);
  const bestsellers = page.getByRole('region', { name: 'Bestsellers' });
  await expect(bestsellers).toBeVisible();
  expect((await collections.boundingBox())!.y).toBeLessThan((await bestsellers.boundingBox())!.y);
  expect((await page.getByRole('searchbox').boundingBox())!.y).toBeGreaterThan(
    (await bestsellers.boundingBox())!.y + (await bestsellers.boundingBox())!.height);
  const geometry = await collections.evaluate(element => ({
    width: element.clientWidth, overflow: element.scrollWidth > element.clientWidth,
    card: element.querySelector('a')!.getBoundingClientRect().width,
    names: [...element.querySelectorAll('a')].map(link => link.textContent),
  }));
  expect(geometry.overflow).toBe(true);
  expect(names).toContain(geometry.names[0]);
  const pause = page.getByRole('button', { name: 'Pause collection rotation' });
  await expect(pause).toHaveClass(/sr-only/);
  const movement = await collections.evaluate(element => new Promise<number[]>(resolve => {
    const started = performance.now();
    const positions: number[] = [];
    const sample = () => {
      positions.push(element.scrollLeft);
      if (performance.now() - started < 6500) requestAnimationFrame(sample);
      else resolve(positions);
    };
    requestAnimationFrame(sample);
  }));
  expect(new Set(movement.map(position => Math.round(position))).size).toBeGreaterThan(15);
  expect(movement[movement.length - 1]).toBeGreaterThan(0);
  const durationDistance = movement[movement.length - 1] - movement[0];
  expect(durationDistance).toBeGreaterThan(80);
  expect(durationDistance).toBeLessThan(140);
  await pause.focus();
  await pause.press('Enter');
  await expect(page.getByRole('button', { name: 'Resume collection rotation' })).toHaveAttribute('aria-pressed', 'true');
  await collections.evaluate(element => element.scrollTo({ left: 0, behavior: 'instant' }));
  await expect.poll(() => collections.evaluate(element => element.scrollLeft)).toBeLessThanOrEqual(2);
  if (page.viewportSize()!.width < 640) {
    expect(geometry.width / geometry.card).toBeGreaterThan(2.4);
    expect(geometry.width / geometry.card).toBeLessThan(2.8);
    await expect(page.getByRole('button', { name: 'Next collections' })).toBeHidden();
    await collections.evaluate(element => element.scrollBy({ left: element.clientWidth, behavior: 'instant' }));
  } else {
    await expect(page.getByRole('button', { name: 'Previous collections' })).toBeDisabled();
    const arrow = await page.getByRole('button', { name: 'Next collections' }).boundingBox();
    const carousel = await collections.boundingBox();
    expect(arrow!.x).toBeGreaterThan(carousel!.x);
    expect(arrow!.x + arrow!.width).toBeLessThanOrEqual(carousel!.x + carousel!.width);
    expect(arrow!.y).toBeGreaterThan(carousel!.y);
    expect(arrow!.y + arrow!.height).toBeLessThanOrEqual(carousel!.y + carousel!.height);
    const photo = await collections.locator('a:not([aria-hidden]) img').first().boundingBox();
    expect(Math.abs(arrow!.y + arrow!.height / 2 - (photo!.y + photo!.height / 2))).toBeLessThan(2);
    await page.getByRole('button', { name: 'Next collections' }).click();
  }
  await expect.poll(() => collections.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
  await expect(collections.locator('img').first()).toHaveCSS('object-fit', 'contain');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  await page.getByRole('link', { name: 'View all', exact: true }).click();
  await expect(page).toHaveURL(/\/collections\/$/);
});

test('six bestsellers rotate smoothly with arrows inside their own carousel', async ({ page }) => {
  const state = await installMockSupabase(page);
  while (state.products.length < 6) {
    const index = state.products.length;
    const copy = structuredClone(state.products[0]);
    copy.id = `bestseller-${index}`;
    copy.name = `Bestseller ${index}`;
    copy.product_variants = copy.product_variants.map((variant, i) => ({ ...variant,
      id: `bestseller-${index}-variant-${i}`, product_id: copy.id }));
    state.products.push(copy);
  }
  for (const product of state.products) {
    product.product_variants[0].in_stock = true;
    product.product_variants[0].available_quantity = 2;
  }
  await page.route('**/rest/v1/rpc/get_catalogue_bestsellers', route =>
    route.fulfill({ json: state.products.slice(0, 6).map(product => ({ product_id: product.id })) }));
  await page.goto('/');
  const section = page.getByRole('region', { name: 'Bestsellers' });
  await section.scrollIntoViewIfNeeded();
  const track = section.getByRole('group', { name: 'Bestsellers' });
  await expect(track.getByRole('link')).toHaveCount(6);
  await expect.poll(() => track.evaluate(element => element.scrollLeft), { timeout: 8000 }).toBeGreaterThan(0);
  await expect(section.getByRole('button', { name: 'Pause bestseller rotation' })).toHaveClass(/sr-only/);
  if (page.viewportSize()!.width >= 640) {
    const arrow = await section.getByRole('button', { name: 'Next bestsellers' }).boundingBox();
    const box = await track.boundingBox();
    expect(arrow!.y).toBeGreaterThan(box!.y);
    expect(arrow!.y + arrow!.height).toBeLessThanOrEqual(box!.y + box!.height);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});

test('bestsellers retain full portrait and landscape photos inside square cards', async ({ page }) => {
  const state = await installMockSupabase(page);
  const products = state.products.slice(0, 2);
  for (const [index, product] of products.entries()) {
    product.product_variants[0].in_stock = true;
    product.product_variants[0].available_quantity = 2;
    product.product_variants[0].image_url = `https://images.luviacreations.com/framing-${index}.svg`;
  }
  await page.route('**/framing-*.svg', route => {
    const portrait = route.request().url().includes('framing-0');
    const width = portrait ? 300 : 600;
    const height = portrait ? 600 : 300;
    return route.fulfill({ contentType: 'image/svg+xml',
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="pink"/><rect x="${width - 30}" y="${height - 30}" width="30" height="30" fill="brown"/></svg>` });
  });
  await page.route('**/rest/v1/rpc/get_catalogue_bestsellers', route =>
    route.fulfill({ json: products.map(product => ({ product_id: product.id })) }));
  await page.goto('./');
  const section = page.getByRole('region', { name: 'Bestsellers' });
  await section.scrollIntoViewIfNeeded();
  for (const image of await section.getByRole('img').all()) {
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    const fits = await image.evaluate(node => {
      const img = node as HTMLImageElement;
      const box = img.getBoundingClientRect();
      const scale = Math.min(box.width / img.naturalWidth, box.height / img.naturalHeight);
      return getComputedStyle(img).objectFit === 'contain'
        && img.naturalWidth * scale <= box.width + 0.1
        && img.naturalHeight * scale <= box.height + 0.1;
    });
    expect(fits).toBe(true);
  }
});

test('bestsellers open product details with delivery policies and recommendations', async ({ page }) => {
  const state = await installMockSupabase(page);
  await page.route('**/rest/v1/rpc/get_catalogue_bestsellers', route =>
    route.fulfill({ json: [{ product_id: 'product-1' }, { product_id: 'product-2' }] }));
  const coaster = state.products.find(product => product.id === 'product-2')!;
  coaster.category = state.products.find(product => product.id === 'product-1')!.category;
  coaster.in_stock = true;
  coaster.product_variants[0].in_stock = true;
  coaster.product_variants[0].available_quantity = 2;
  await page.goto('./');
  const section = page.getByRole('region', { name: 'Bestsellers' });
  await expect(section).toBeVisible();
  await expect(section.getByRole('link')).toHaveCount(2);
  for (const image of await section.getByRole('img').all()) {
    await expect.poll(() => image.evaluate(node => getComputedStyle(node).objectFit)).toBe('contain');
  }
  const collections = page.getByRole('navigation', { name: 'Explore collections' });
  await expect(collections.getByRole('link', { name: 'Charms', exact: true }).locator('img')).toBeVisible();
  await section.getByRole('link', { name: /Rose Charm/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/\/p\/rose-charm\/$/);
  await expect(page.getByRole('region', { name: 'Delivery and returns' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'You May Also Like' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Delivery and returns' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Full return and refund policy', includeHidden: true })).toHaveAttribute('href', '/return-policy/');
  const recommendations = page.getByRole('region', { name: 'You May Also Like' });
  await recommendations.getByRole('link', { name: /Flower Coaster/ }).click();
  await expect(page.getByRole('heading', { name: 'Flower Coaster', exact: true })).toBeVisible();
});

test('bestsellers stay hidden with insufficient sales-backed products', async ({ page }) => {
  await installMockSupabase(page);
  await page.route('**/rest/v1/rpc/get_catalogue_bestsellers', route =>
    route.fulfill({ json: [{ product_id: 'product-1' }] }));
  await page.goto('./');
  await expect(page.getByRole('article', { name: 'Product: Rose Charm' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Bestsellers' })).toHaveCount(0);
});
