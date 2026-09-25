import { expect, test } from '@playwright/test';
import { installMockSupabase, type MockCatalogueState } from './mockSupabase';

const touch = (x: number, y: number, identifier = 1) => ({
  identifier,
  clientX: x,
  clientY: y,
  pageX: x,
  pageY: y,
  screenX: x,
  screenY: y,
});

let catalogueState: MockCatalogueState;

test.beforeEach(async ({ page }) => {
  catalogueState = await installMockSupabase(page);
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Shop the Collection' })).toBeVisible();
});

test('persists an anonymous cart and sends the complete enquiry to WhatsApp', async ({ page }) => {
  const roseCard = page.getByRole('article').filter({
    has: page.getByRole('heading', { name: 'Rose Charm' }),
  });
  await roseCard.getByRole('button', { name: 'Add to cart — Rose Charm' }).click();
  await expect(
    roseCard.getByRole('button', { name: 'Added! — Rose Charm (1 in cart)' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open cart with 1 item' })).toBeVisible();

  await roseCard.getByRole('button', { name: 'View Rose Charm' }).click();
  const productDialog = page.getByRole('dialog', { name: 'Rose Charm' });
  await expect(
    productDialog.getByRole('button', {
      name: 'Increase quantity of Rose Charm — Rose Pink',
    }),
  ).toBeVisible();
  await expect(productDialog.getByLabel('1 of Rose Charm — Rose Pink in cart')).toBeVisible();
  await productDialog.getByRole('button', { name: 'Close', exact: true }).click();

  await page.getByRole('button', { name: 'Open cart with 1 item' }).click();
  const cartDialog = page.getByRole('dialog', { name: 'Shopping cart' });
  await expect(cartDialog.getByText('Rose Charm')).toBeVisible();
  await expect(cartDialog.getByText('Variant: Rose Pink')).toBeVisible();
  await cartDialog
    .getByRole('button', { name: 'Increase quantity of Rose Charm — Rose Pink' })
    .click();
  await expect(page.getByRole('button', { name: 'Open cart with 2 items' })).toBeVisible();

  const enquiry = cartDialog.getByRole('link', {
    name: 'Enquire about cart on WhatsApp',
  });
  await expect(enquiry).toHaveAttribute('href', /Rose%20Charm/);
  await expect(enquiry).toHaveAttribute('href', /Quantity%3A%202/);
  await expect(enquiry).not.toHaveAttribute('href', /Cart%20reference|CRT-TEST0001/);
  await expect(cartDialog).not.toContainText('CRT-TEST0001');
  await enquiry.click();
  await expect.poll(() => catalogueState.carts[0]?.status).toBe('whatsapp_started');
  expect(catalogueState.carts[0].cart_items[0]).toMatchObject({
    product_name: 'Rose Charm',
    variant_name: 'Rose Pink',
    quantity: 2,
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Shop the Collection' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open cart with 2 items' })).toBeVisible();
  await page.getByRole('button', { name: 'Open cart with 2 items' }).click();
  const restoredCart = page.getByRole('dialog', { name: 'Shopping cart' });
  await expect(restoredCart.getByText('Rose Charm')).toBeVisible();
  await restoredCart.getByRole('button', { name: 'Clear cart' }).click();
  await expect(restoredCart.getByText('Your cart is empty')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open cart with 0 items' })).toBeVisible();
  await expect.poll(() => catalogueState.carts.length).toBe(0);
});

test('shows compact cart icons with tooltips on cards and opened products', async ({ page }) => {
  const roseCard = page.getByRole('article').filter({
    has: page.getByRole('heading', { name: 'Rose Charm' }),
  });
  const cardCartButton = roseCard.getByRole('button', {
    name: 'Add to cart — Rose Charm',
  });
  await expect(cardCartButton).toHaveText('');
  await cardCartButton.hover();
  await expect(roseCard.getByRole('tooltip', { name: 'Add to cart' })).toBeVisible();

  await roseCard.getByRole('button', { name: 'View Rose Charm' }).click();
  const productDialog = page.getByRole('dialog', { name: 'Rose Charm' });
  const modalCartButton = productDialog.getByRole('button', {
    name: 'Add to cart — Rose Charm',
  });
  await expect(modalCartButton).toHaveText('');
  await modalCartButton.hover();
  await expect(productDialog.getByRole('tooltip', { name: 'Add to cart' })).toBeVisible();
});

test('decreases and removes an individual variant from the cart', async ({ page }) => {
  const roseCard = page.getByRole('article').filter({
    has: page.getByRole('heading', { name: 'Rose Charm' }),
  });
  await roseCard.getByRole('button', { name: 'Add to cart — Rose Charm' }).click();
  await roseCard
    .getByRole('button', { name: 'Add to cart — Rose Charm (1 in cart)' })
    .click();
  await expect(page.getByRole('button', { name: 'Open cart with 2 items' })).toBeVisible();

  await page.getByRole('button', { name: 'Open cart with 2 items' }).click();
  const cartDialog = page.getByRole('dialog', { name: 'Shopping cart' });
  await expect(cartDialog.getByText('Variant: Rose Pink')).toBeVisible();
  await cartDialog
    .getByRole('button', { name: 'Decrease quantity of Rose Charm — Rose Pink' })
    .click();
  await expect(page.getByRole('button', { name: 'Open cart with 1 item' })).toBeVisible();
  await expect.poll(() => catalogueState.carts[0]?.cart_items[0]?.quantity).toBe(1);

  await cartDialog
    .getByRole('button', { name: 'Remove Rose Charm — Rose Pink from cart' })
    .click();
  await expect(cartDialog.getByText('Your cart is empty')).toBeVisible();
  await expect.poll(() => catalogueState.carts[0]?.cart_items.length).toBe(0);
});

test('filters, searches, opens products, and exposes customer contact links', async ({ page }) => {
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.dataLayer?.some(
          (entry) => {
            const values = Array.from(entry as ArrayLike<unknown>);
            return values[0] === 'config' && values[1] === 'G-TEST123456';
          },
        ),
      ),
    )
    .toBe(true);
  await expect(page.getByLabel('Shipping available across India')).toBeVisible();
  const productCards = page.locator('main').getByRole('article');
  await expect(productCards.first()).toContainText('Rose Charm');
  await expect(productCards.first()).toContainText('Featured');
  await expect(productCards.nth(1)).toContainText('New Heart Charm');
  await expect(productCards.nth(1)).toContainText('New');
  await expect(productCards.nth(2)).toContainText('Flower Coaster');
  await expect(page.getByRole('button', { name: 'View Rose Charm' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View Flower Coaster' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Empty Category', exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'New', exact: true }).click();
  await expect(page.getByRole('button', { name: 'View New Heart Charm' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View Rose Charm' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'View Flower Coaster' })).toHaveCount(0);
  await page.getByRole('button', { name: 'All', exact: true }).click();

  await page.getByRole('searchbox', { name: 'Search crochet items' }).fill('coaster');
  await expect(page.getByRole('button', { name: 'View Rose Charm' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'View Flower Coaster' })).toBeVisible();

  await page.getByRole('searchbox', { name: 'Search crochet items' }).clear();
  await page.getByRole('button', { name: 'Charms', exact: true }).click();
  await expect(page.getByRole('button', { name: 'View Rose Charm' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View Flower Coaster' })).toHaveCount(0);

  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.getByRole('button', { name: 'View Rose Charm' }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.dataLayer?.some(
          (entry) => {
            const values = Array.from(entry as ArrayLike<unknown>);
            return (
              values[0] === 'event' &&
              values[1] === 'select_item' &&
              (values[2] as { items?: Array<{ item_id?: string }> })?.items?.[0]?.item_id ===
                'product-1'
            );
          },
        ),
      ),
    )
    .toBe(true);
  const dialog = page.getByRole('dialog', { name: 'Rose Charm' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('region', { name: 'Product variants' })).toBeVisible();
  await dialog.getByRole('button', { name: /Ivory/ }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.dataLayer?.some(
          (entry) => {
            const values = Array.from(entry as ArrayLike<unknown>);
            return (
              values[0] === 'event' &&
              values[1] === 'select_variant' &&
              (values[2] as { variant_name?: string })?.variant_name === 'Ivory'
            );
          },
        ),
      ),
    )
    .toBe(true);
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
  await expect(page.getByRole('dialog', { name: 'New Heart Charm' })).toBeVisible();
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

test('supports campaign deep links and carries attribution into WhatsApp', async ({ page }) => {
  await page.goto('./?utm_source=meta&utm_campaign=diwali#product=rose-charm', {
    waitUntil: 'domcontentloaded',
  });

  const dialog = page.getByRole('dialog', { name: 'Rose Charm' });
  await expect(dialog).toBeVisible();

  const enquiry = dialog.getByRole('link', { name: 'Order / Enquire on WhatsApp' });
  await expect(enquiry).toHaveAttribute('href', /Rose%20Charm/);
  await expect(enquiry).toHaveAttribute('href', /Ref%3A%20meta%2Fdiwali/);

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Attribution persists for the rest of the visit, even without UTM parameters.
  await page.getByRole('button', { name: 'View Flower Coaster' }).click();
  await expect(
    page
      .getByRole('dialog', { name: 'Flower Coaster' })
      .getByRole('link', { name: 'Order / Enquire on WhatsApp' }),
  ).toHaveAttribute('href', /Ref%3A%20meta%2Fdiwali/);
});

test('keeps the installed PWA source out of WhatsApp messages', async ({ page }) => {
  // The installed PWA's start_url carries utm_source=pwa&utm_medium=app so GA
  // can attribute app launches; that source is not an ad campaign and must
  // never leak into the WhatsApp message customers see.
  await page.goto('./?utm_source=pwa&utm_medium=app#product=rose-charm', {
    waitUntil: 'domcontentloaded',
  });

  const dialog = page.getByRole('dialog', { name: 'Rose Charm' });
  await expect(dialog).toBeVisible();

  const enquiry = dialog.getByRole('link', { name: 'Order / Enquire on WhatsApp' });
  await expect(enquiry).toHaveAttribute('href', /Rose%20Charm/);
  await expect(enquiry).not.toHaveAttribute('href', /Ref/);

  const quickOrder = dialog.getByRole('link', { name: 'Quick order on WhatsApp' });
  await expect(quickOrder).not.toHaveAttribute('href', /Ref/);
});

test('keeps campaign deep links working after a product is renamed', async ({ page }) => {
  // The trailing product id resolves the link even though the slug is stale.
  await page.goto('./?utm_source=meta#product=an-outdated-name--product-1', {
    waitUntil: 'domcontentloaded',
  });

  await expect(page.getByRole('dialog', { name: 'Rose Charm' })).toBeVisible();
  await expect(page).toHaveURL(/#product=rose-charm--product-1$/);

  // A stale link pasted into an already-open tab only changes the hash.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.evaluate(() => {
    window.location.hash = '#product=another-old-name--product-2';
  });
  await expect(page.getByRole('dialog', { name: 'Flower Coaster' })).toBeVisible();
});

test('shows prices only for products opted into price display', async ({ page }) => {
  const roseCard = page.getByRole('article').filter({
    has: page.getByRole('heading', { name: 'Rose Charm' }),
  });
  await expect(roseCard.getByText('₹349')).toBeVisible();

  // Flower Coaster has a price recorded but has not opted into showing it.
  const coasterCard = page.getByRole('article').filter({
    has: page.getByRole('heading', { name: 'Flower Coaster' }),
  });
  await expect(coasterCard.getByText('₹')).toHaveCount(0);

  await roseCard.getByRole('button', { name: 'View Rose Charm' }).click();
  await expect(page.getByRole('dialog', { name: 'Rose Charm' }).getByText('₹349')).toBeVisible();
});

test('supports full-modal swipes and touch-only overlay controls', async ({ page }) => {
  await page.getByRole('button', { name: 'View Rose Charm' }).click();
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
  await expect(page.getByRole('dialog', { name: 'New Heart Charm' })).toBeVisible();

  const nextDescription = page.getByText('A newly published crochet heart charm.');
  await nextDescription.dispatchEvent('touchstart', {
    touches: [touch(180, 650, 2)],
    changedTouches: [touch(180, 650, 2)],
  });
  await nextDescription.dispatchEvent('touchend', {
    touches: [],
    changedTouches: [touch(190, 450, 2)],
  });
  await expect(page.getByRole('dialog', { name: 'New Heart Charm' })).toBeVisible();

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
