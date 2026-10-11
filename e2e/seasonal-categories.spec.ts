import { expect, test } from '@playwright/test';
import { installMockSupabase } from './mockSupabase';

test('ordinary ticker messages move at 50 pixels per second too', async ({ page }) => {
  await installMockSupabase(page);
  await page.goto('./');
  await page.mouse.move(0, 200);
  const track = page.locator('.shipping-ticker-track');
  await expect.poll(() => track.evaluate(node => node.scrollWidth / 2 / parseFloat(getComputedStyle(node).animationDuration))).toBeCloseTo(50, 1);
  const velocity = await track.evaluate(async node => {
    const animation = node.getAnimations()[0];
    const startTime = Number(animation.currentTime);
    const startX = new DOMMatrixReadOnly(getComputedStyle(node).transform).m41;
    await new Promise(resolve => setTimeout(resolve, 200));
    return Math.abs(new DOMMatrixReadOnly(getComputedStyle(node).transform).m41 - startX) / ((Number(animation.currentTime) - startTime) / 1000);
  });
  expect(velocity).toBeCloseTo(50, 1);
});

test('admin creates a seasonal category, selects existing products and hides it without moving products', async ({ page }) => {
  const state = await installMockSupabase(page);
  type CategoryRow = { name: string; sort_order: number; is_seasonal: boolean; visible: boolean; overview?: string; featured_ticker?: boolean; seasonal_category_products: { product_id: string }[] };
  const categories: CategoryRow[] = state.categories.map(name => ({
    name, sort_order: 100, is_seasonal: false, visible: true, seasonal_category_products: [],
  }));
  await page.route('**/rest/v1/categories*', async route => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      categories.push({ ...body, visible: true, seasonal_category_products: [] });
      await route.fulfill({ status: 201 });
    } else await route.fulfill({ json: categories });
  });
  await page.route('**/rest/v1/rpc/save_seasonal_category', async route => {
    const body = route.request().postDataJSON();
    const category = categories.find(item => item.name === body.category_name)!;
    category.visible = body.show_category;
    category.overview = body.category_overview;
    category.featured_ticker = body.feature_in_ticker;
    category.seasonal_category_products = body.selected_product_ids.map((product_id: string) => ({ product_id }));
    await route.fulfill({ status: 204 });
  });
  await page.route('**/functions/v1/analyze-product', route => {
    expect(route.request().postDataJSON()).toEqual({ mode: 'category-overview', categoryName: 'Navaratri' });
    return route.fulfill({ json: { overview: 'Explore handmade rose charms in our Navaratri collection.' } });
  });
  await page.goto('./#admin');
  await page.getByLabel('Email', { exact: true }).fill('admin@luvia.test');
  await page.getByLabel('Password').fill('test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: /Manage categories/ }).click();
  await page.getByLabel('New category', { exact: true }).fill('Navaratri');
  await page.getByLabel('Seasonal category', { exact: true }).check();
  await page.getByRole('button', { name: 'Add category', exact: true }).click();
  await page.getByRole('button', { name: 'Manage products', exact: true }).click();
  const editor = page.getByRole('region', { name: 'Products in Navaratri' });
  await editor.getByLabel('Rose Charm · Charms', { exact: true }).check();
  await editor.getByLabel('Feature this category in the clickable store ticker').check();
  await editor.getByRole('button', { name: 'Save seasonal category' }).click();
  await expect(editor).toHaveCount(0);
  expect(state.products.find(product => product.name === 'Rose Charm')?.category).toBe('Charms');
  await page.getByRole('button', { name: 'Manage products', exact: true }).click();
  await editor.getByRole('button', { name: 'Generate overview with Gemini' }).click();
  await expect(editor.getByLabel('Category overview')).toHaveValue('Explore handmade rose charms in our Navaratri collection.');
  expect(categories.find(item => item.name === 'Navaratri')?.overview).toBe('');
  await editor.getByLabel('Category overview').fill('Reviewed Navaratri collection overview.');
  await editor.getByRole('button', { name: 'Save seasonal category' }).click();
  await expect(editor).toHaveCount(0);
  await page.goto('./?category=Navaratri');
  await expect(page.getByRole('button', { name: 'Navaratri', exact: true })).toBeVisible();
  const buttons = page.getByLabel('Product categories', { exact: true }).getByRole('button');
  await expect(buttons.first()).toHaveText('Navaratri');
  await expect(buttons.first()).toHaveClass(/badge-glow/);
  await expect.poll(() => buttons.first().evaluate(node => getComputedStyle(node).animationName)).toBe('badge-glow');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => buttons.first().evaluate(node => getComputedStyle(node).animationName)).toBe('none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const announcement = page.getByRole('link', { name: 'Check out our Navaratri collection', exact: true });
  await expect(announcement).toHaveAttribute('href', '/collections/navaratri/');
  const track = page.locator('.shipping-ticker-featured');
  await expect.poll(() => track.evaluate(node => getComputedStyle(node).animationName)).toBe('shipping-ticker');
  await expect.poll(() => track.evaluate(node => node.scrollWidth / 2 / parseFloat(getComputedStyle(node).animationDuration))).toBeCloseTo(50, 1);
  await expect.poll(() => announcement.evaluate(node => getComputedStyle(node).animationName)).toBe('seasonal-ticker-glow');
  const initialTransform = await track.evaluate(node => getComputedStyle(node).transform);
  await expect.poll(() => track.evaluate(node => getComputedStyle(node).transform)).not.toBe(initialTransform);
  await announcement.focus();
  await expect.poll(() => track.evaluate(node => getComputedStyle(node).animationName)).toBe('none');
  await expect(announcement).toBeInViewport();
  await page.getByRole('button', { name: 'Open navigation' }).focus();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Navaratri', exact: true })).toHaveClass(/bg-mustard/);
  await page.getByRole('button', { name: 'Close navigation' }).click();
  await page.getByLabel('Store announcements', { exact: true }).hover();
  await expect.poll(() => track.evaluate(node => getComputedStyle(node).animationPlayState)).toBe('paused');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => track.evaluate(node => getComputedStyle(node).animationName)).toBe('none');
  await expect.poll(() => announcement.evaluate(node => getComputedStyle(node).animationName)).toBe('none');
  await expect(page.getByRole('article', { name: 'Product: Rose Charm' })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Product: New Heart Charm' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Charms', exact: true }).click();
  await expect(buttons.first()).toHaveText('Navaratri');
  await expect(buttons.first()).toHaveClass(/bg-mustard/);
  await expect(buttons.first()).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('article', { name: 'Product: Rose Charm' })).toBeVisible();
  await page.getByRole('link', { name: 'Check out our Navaratri collection', exact: true }).click();
  await expect(page).toHaveURL(/\/collections\/navaratri\/$/);
  await expect(page.getByText('Reviewed Navaratri collection overview.', { exact: true })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Product: Rose Charm' })).toBeVisible();
  await page.goto('./#admin');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: /Manage categories/ }).click();
  await page.getByRole('button', { name: 'Manage products', exact: true }).click();
  await editor.getByLabel('Show this seasonal category in the shop').uncheck();
  await editor.getByRole('button', { name: 'Save seasonal category' }).click();
  await expect(editor).toHaveCount(0);
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Navaratri', exact: true })).toHaveCount(0);
  await expect(page.getByRole('article', { name: 'Product: Rose Charm' })).toBeVisible();
});
