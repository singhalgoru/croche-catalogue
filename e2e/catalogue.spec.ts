import { expect, test } from '@playwright/test';
import { installMockSupabase } from './mockSupabase';

const touch = (x: number, y: number, identifier = 1) => ({
  identifier,
  clientX: x,
  clientY: y,
  pageX: x,
  pageY: y,
  screenX: x,
  screenY: y,
});

test.beforeEach(async ({ page }) => {
  await installMockSupabase(page);
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Shop the Collection' })).toBeVisible();
});

test('filters, searches, opens products, and exposes customer contact links', async ({ page }) => {
  await expect(page.getByRole('button', { name: /Rose Charm/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Flower Coaster/ })).toBeVisible();

  await page.getByRole('searchbox', { name: 'Search crochet items' }).fill('coaster');
  await expect(page.getByRole('button', { name: /Rose Charm/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Flower Coaster/ })).toBeVisible();

  await page.getByRole('searchbox', { name: 'Search crochet items' }).clear();
  await page.getByRole('button', { name: 'Charms', exact: true }).click();
  await expect(page.getByRole('button', { name: /Rose Charm/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Flower Coaster/ })).toHaveCount(0);

  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.getByRole('button', { name: /Rose Charm/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Rose Charm' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('region', { name: 'Product variants' })).toBeVisible();
  await dialog.getByRole('button', { name: /Ivory/ }).click();
  await expect(dialog.getByText('Sold out', { exact: true }).first()).toBeVisible();
  await dialog.getByRole('button', { name: 'Zoom product image' }).click();
  const zoomViewer = page.getByRole('dialog', { name: 'Zoomed image of Rose Charm — Ivory' });
  await expect(zoomViewer).toBeVisible();
  await zoomViewer.getByRole('button', { name: 'Zoom in' }).click();
  await expect(zoomViewer.getByRole('button', { name: 'Reset zoom' })).toHaveText('150%');
  await page.keyboard.press('Escape');
  await expect(zoomViewer).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Order / Enquire on WhatsApp' })).toHaveAttribute(
    'href',
    /Ivory/,
  );

  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('dialog', { name: 'Flower Coaster' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await expect(page.getByRole('link', { name: 'Contact on WhatsApp' })).toHaveAttribute(
    'href',
    /^https:\/\/wa\.me\//,
  );
  await expect(page.getByRole('link', { name: 'Contact on Instagram' })).toHaveAttribute(
    'href',
    'https://www.instagram.com/luvia.craftedwithlove?stkn=c3ZvM2pxMWw0Mnhl',
  );
});

test('supports full-modal swipes and touch-only overlay controls', async ({ page }) => {
  await page.getByRole('button', { name: /Rose Charm/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Rose Charm' });
  const description = dialog.getByText('A detailed handmade rose charm for bags and keys.');
  const previous = dialog.getByRole('button', { name: 'Show previous product' });
  const next = dialog.getByRole('button', { name: 'Show next product' });
  const close = dialog.getByRole('button', { name: 'Close product details' });

  for (const control of [previous, next, close]) {
    await expect(control).toHaveCSS('pointer-events', 'none');
    await expect(control).toHaveAttribute('style', /opacity: 0/);
  }

  await description.dispatchEvent('touchstart', {
    touches: [touch(300, 650)],
    changedTouches: [touch(300, 650)],
  });
  await expect(previous).toHaveCSS('pointer-events', 'auto');
  await expect(next).toHaveCSS('pointer-events', 'auto');
  await expect(close).toHaveCSS('pointer-events', 'auto');

  await description.dispatchEvent('touchend', {
    touches: [],
    changedTouches: [touch(80, 655)],
  });
  await expect(page.getByRole('dialog', { name: 'Flower Coaster' })).toBeVisible();

  const nextDescription = page.getByText('A cheerful crochet coaster for a cosy table setting.');
  await nextDescription.dispatchEvent('touchstart', {
    touches: [touch(180, 650, 2)],
    changedTouches: [touch(180, 650, 2)],
  });
  await nextDescription.dispatchEvent('touchend', {
    touches: [],
    changedTouches: [touch(190, 450, 2)],
  });
  await expect(page.getByRole('dialog', { name: 'Flower Coaster' })).toBeVisible();

  await page.waitForTimeout(2100);
  const hiddenControls = [
    page.getByRole('button', { name: 'Show previous product' }),
    page.getByRole('button', { name: 'Show next product' }),
    page.getByRole('button', { name: 'Close product details' }),
  ];
  for (const control of hiddenControls) {
    await expect(control).toHaveCSS('pointer-events', 'none');
    await expect(control).toHaveAttribute('style', /opacity: 0/);
  }
});
