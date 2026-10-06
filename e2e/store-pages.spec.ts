import { expect, test } from '@playwright/test';
import { installMockSupabase } from './mockSupabase';

test('store pages reflect added, renamed and removed admin categories without hardcoded links', async ({ page }) => {
  const state = await installMockSupabase(page);
  await page.goto('/collections/');
  const collections = page.getByRole('navigation', { name: 'Explore collections' });
  await expect(collections.getByRole('link', { name: 'Charms', exact: true })).toBeVisible();
  state.categories.push('Gift Sets');
  state.categorySettings['Gift Sets'] = { priority: 1 };
  await page.getByRole('button', { name: 'Refresh catalogue' }).click();
  await expect(collections.getByRole('link', { name: 'Gift Sets', exact: true })).toHaveCount(0);
  state.products[0].category = 'Gift Sets';
  await page.getByRole('button', { name: 'Refresh catalogue' }).click();
  await expect(collections.getByRole('link', { name: 'Gift Sets', exact: true })).toHaveAttribute('href', '/collections/gift-sets/');
  await collections.getByRole('link', { name: 'Gift Sets', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Handmade Gift Sets', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Rose Charm', exact: true })).toBeVisible();
  state.categories = state.categories.map(category => category === 'Gift Sets' ? 'Gift Bundles' : category);
  delete state.categorySettings['Gift Sets'];
  state.categorySettings['Gift Bundles'] = { priority: 1 };
  state.products[0].category = 'Gift Bundles';
  await page.getByRole('button', { name: 'Refresh catalogue' }).click();
  await expect(page.getByRole('alert')).toContainText('no longer available');
  await page.getByRole('navigation', { name: 'Explore collections' }).getByRole('link', { name: 'Gift Bundles', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Handmade Gift Bundles', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Rose Charm', exact: true })).toBeVisible();
  state.categories = state.categories.filter(category => category !== 'Gift Bundles');
  delete state.categorySettings['Gift Bundles'];
  state.products[0].category = 'Charms';
  await page.getByRole('button', { name: 'Refresh catalogue' }).click();
  await expect(page.getByRole('alert')).toContainText('no longer available');
  await expect(page.getByRole('heading', { name: 'Rose Charm', exact: true })).toHaveCount(0);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,follow');
  state.categories.push('Handmade Gifts');
  state.categorySettings['Handmade Gifts'] = { priority: 1 };
  state.products[0].category = 'Handmade Gifts';
  await page.goto('/?collectionPage=handmade-gifts');
  await expect(page.getByRole('heading', { name: 'Handmade Handmade Gifts', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/collections\/handmade-gifts\/$/);
});

test('about and ordering FAQ retain accessible content and current category navigation', async ({ page }) => {
  await installMockSupabase(page);
  await page.goto('/about/');
  await expect(page.getByRole('heading', { name: 'About Luvia & contact', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Explore collections' }).getByRole('link', { name: 'Charms', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Read the ordering FAQ', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ordering, delivery & care FAQ', exact: true })).toBeVisible();
  await page.getByText('How do I place an order?', { exact: true }).click();
  await expect(page.getByText(/Adding items or sending a message does not confirm an order/)).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

test('photo-led collections hub and homepage links lead directly to published collections', async ({ page }) => {
  const state = await installMockSupabase(page);
  await page.goto('/collections/');
  const nav = page.getByRole('navigation', { name: 'Explore collections' });
  const charms = nav.getByRole('link', { name: 'Charms', exact: true });
  await expect(charms).toBeVisible();
  await expect(charms.locator('img:not([aria-hidden])')).toHaveCount(1);
  const count = state.products.filter(product => product.published && product.category === 'Charms').length;
  await expect(charms).toContainText(`${count} products`);
  await expect(page.getByRole('heading', { name: 'Explore collections', exact: true })).toHaveCount(0);
  await charms.click();
  await expect(page.getByRole('heading', { name: 'Handmade Charms', exact: true })).toBeVisible();
  await page.goto('/');
  const homepageCollections = page.getByRole('navigation', { name: 'Explore collections' });
  await expect(homepageCollections.getByRole('link', { name: 'Charms', exact: true })).toHaveAttribute('href', '/collections/charms/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});

test('store headers keep the logo left and product details offer a contextual customisation enquiry', async ({ page }) => {
  await installMockSupabase(page);
  for (const path of ['/collections/', '/collections/charms/', '/about/', '/faq/']) {
    await page.goto(path);
    const logo = page.getByRole('link', { name: 'Luvia Creations — home' });
    const menu = page.getByRole('button', { name: 'Open navigation' });
    const logoBox = await logo.boundingBox();
    const menuBox = await menu.boundingBox();
    expect(logoBox).not.toBeNull();
    expect(menuBox).not.toBeNull();
    expect(logoBox!.x + logoBox!.width).toBeLessThan(menuBox!.x);
    expect(logoBox!.x).toBeLessThan(150);
    expect(logoBox!.width).toBe(menuBox!.width);
    expect(Math.abs(logoBox!.y - menuBox!.y)).toBeLessThan(2);
  }
  await page.goto('/collections/charms/');
  await page.getByRole('link', { name: 'View Rose Charm', exact: true }).click();
  const request = page.getByRole('link', { name: 'Request a different colour or customisation' });
  await expect(request).toBeVisible();
  const text = new URL((await request.getAttribute('href'))!).searchParams.get('text');
  expect(text).toContain('Rose Charm');
  expect(text).toContain('My preferred colour or change:');
  expect(text).toContain('dispatch estimate before I order');
  expect(text).toContain('?variant=');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  await page.goto('/');
  const logo = page.getByRole('link', { name: 'Luvia Creations — home' });
  const cart = page.getByRole('button', { name: /Open cart with/ });
  const logoBox = await logo.boundingBox();
  const cartBox = await cart.boundingBox();
  if (page.viewportSize()!.width < 640) {
    expect(logoBox!.width).toBe(cartBox!.width);
    expect(logoBox!.height).toBe(cartBox!.height);
    expect(Math.abs(logoBox!.y - cartBox!.y)).toBeLessThan(2);
  }
});

test('mobile footer is compact with complete contact links and usable tap targets', async ({ page }) => {
  await installMockSupabase(page);
  await page.goto('/faq/');
  const footer = page.getByRole('contentinfo');
  await footer.scrollIntoViewIfNeeded();
  for (const name of ['Explore collections', 'About & contact', 'Ordering FAQ', 'Return and refund policy',
    'Contact on WhatsApp', 'Contact on Instagram', 'orders@luviacreations.com', 'hello@luviacreations.com']) {
    const link = footer.getByRole('link', { name, exact: true });
    await expect(link).toBeVisible();
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  if (page.viewportSize()!.width < 640) {
    expect((await footer.boundingBox())!.height).toBeLessThan(420);
    const whatsapp = await footer.getByRole('link', { name: 'Contact on WhatsApp' }).boundingBox();
    const instagram = await footer.getByRole('link', { name: 'Contact on Instagram' }).boundingBox();
    expect(whatsapp!.y).toBe(instagram!.y);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});
