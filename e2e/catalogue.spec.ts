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
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.dataLayer?.some((entry) => {
          const values = Array.from(entry as ArrayLike<unknown>);
          if (values[0] !== 'event' || values[1] !== 'add_to_cart') return false;
          const parameters = values[2] as {
            currency?: string;
            value?: number;
            items?: Array<Record<string, unknown>>;
          };
          return (
            parameters.currency === 'INR' &&
            parameters.value === 349 &&
            parameters.items?.[0]?.item_id === 'product-1' &&
            parameters.items[0].variant_id === 'variant-1' &&
            parameters.items[0].quantity === 1 &&
            parameters.items[0].price === 349
          );
        }),
      ),
    )
    .toBe(true);
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.fbq?.queue.some((entry) => {
          const values = Array.from(entry);
          if (values[0] !== 'track' || values[1] !== 'AddToCart') return false;
          const parameters = values[2] as Record<string, unknown>;
          return (
            parameters.content_ids?.[0] === 'product-1' &&
            parameters.variant_id === 'variant-1' &&
            parameters.variant_name === 'Rose Pink' &&
            parameters.num_items === 1 &&
            parameters.value === 349 &&
            parameters.currency === 'INR'
          );
        }),
      ),
    )
    .toBe(true);

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
  await expect(roseCard.getByText('Charms')).toHaveCount(0);
  await expect(
    roseCard.getByText('A detailed handmade rose charm for bags and keys.'),
  ).toHaveCount(0);
  await expect(cardCartButton).toHaveText('');
  const [cardImageBox, cardCartBox] = await Promise.all([
    roseCard.getByRole('img', { name: 'Rose Charm' }).boundingBox(),
    cardCartButton.boundingBox(),
  ]);
  expect(cardImageBox).not.toBeNull();
  expect(cardCartBox).not.toBeNull();
  if (test.info().project.name === 'mobile-chromium') {
    expect(cardImageBox!.width).toBeGreaterThan(300);
  }
  expect(cardCartBox!.y).toBeGreaterThanOrEqual(cardImageBox!.y + cardImageBox!.height);
  const cardPriceBox = await roseCard.getByText('₹349').boundingBox();
  expect(cardPriceBox).not.toBeNull();
  expect(Math.abs(
    cardCartBox!.y + cardCartBox!.height / 2 -
      (cardPriceBox!.y + cardPriceBox!.height / 2),
  )).toBeLessThan(8);
  await cardCartButton.hover();
  await expect(roseCard.getByRole('tooltip', { name: 'Add to cart' })).toBeVisible();

  await roseCard.getByRole('button', { name: 'View Rose Charm' }).click();
  const productDialog = page.getByRole('dialog', { name: 'Rose Charm' });
  const modalCartButton = productDialog.getByRole('button', {
    name: 'Add to cart — Rose Charm',
  });
  await expect(modalCartButton).toHaveText('');
  const [modalImageBox, modalCartBox] = await Promise.all([
    productDialog.getByRole('img', { name: 'Rose Charm — Rose Pink' }).boundingBox(),
    modalCartButton.boundingBox(),
  ]);
  expect(modalImageBox).not.toBeNull();
  expect(modalCartBox).not.toBeNull();
  expect(modalCartBox!.y).toBeGreaterThanOrEqual(modalImageBox!.y + modalImageBox!.height);
  await modalCartButton.hover();
  await expect(productDialog.getByRole('tooltip', { name: 'Add to cart' })).toBeVisible();
  await modalCartButton.click();
  await expect(page.getByRole('status')).toContainText(
    'Rose Charm — Rose Pink added to cart',
  );
  await expect(page.getByRole('button', { name: 'Open cart with 1 item' })).toHaveClass(
    /cart-updated/,
  );
});

test('shows a back-to-top control after scrolling the landing page', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Go to top' })).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 700));
  const goToTop = page.getByRole('button', { name: 'Go to top' });
  await expect(goToTop).toBeVisible();
  await goToTop.click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(10);
});

test('opens a product from its card and restores the browsing position', async ({ page }) => {
  const roseCard = page.getByRole('article', { name: 'Product: Rose Charm' });
  await page.evaluate(() => window.scrollTo(0, 650));
  const originalScrollY = await page.evaluate(() => window.scrollY);
  await roseCard.getByRole('heading', { name: 'Rose Charm' }).click();
  const dialog = page.getByRole('dialog', { name: 'Rose Charm' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThanOrEqual(originalScrollY - 2);
});

test('scrolls the first matching product below sticky controls after category selection', async ({
  page,
}) => {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.getByRole('button', { name: 'Home Decor', exact: true }).click();
  const firstProduct = page.getByRole('article', { name: 'Product: Flower Coaster' });
  await expect(firstProduct).toBeVisible();
  await expect
    .poll(async () => {
      const productBox = await firstProduct.boundingBox();
      const categoryBox = await page.getByLabel('Product categories').boundingBox();
      if (!productBox || !categoryBox) return false;
      if (test.info().project.name !== 'mobile-chromium') {
        const scrollPosition = await page.evaluate(() => ({
          current: window.scrollY,
          maximum: document.documentElement.scrollHeight - window.innerHeight,
        }));
        return (
          productBox.y >= 0 &&
          (productBox.y <= 30 || scrollPosition.current >= scrollPosition.maximum - 2)
        );
      }
      return (
        productBox.y >= categoryBox.y + categoryBox.height - 2 &&
        productBox.y <= categoryBox.y + categoryBox.height + 30
      );
    })
    .toBe(true);
});

test('does not refocus category results when the catalogue clock updates', async ({ page }) => {
  await page.addInitScript(() => {
    const nativeSetInterval = window.setInterval.bind(window);
    window.setInterval = ((
      handler: TimerHandler,
      timeout?: number,
      ...args: unknown[]
    ) => nativeSetInterval(handler, timeout === 60_000 ? 100 : timeout, ...args)) as typeof window.setInterval;
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Shop the Collection' })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Product: Rose Charm' })).toBeVisible();

  await page.evaluate(() => {
    const trackedWindow = window as typeof window & { catalogueScrollCalls: number };
    trackedWindow.catalogueScrollCalls = 0;
    const nativeScrollTo = window.scrollTo.bind(window);
    window.scrollTo = (...args: Parameters<typeof window.scrollTo>) => {
      trackedWindow.catalogueScrollCalls += 1;
      nativeScrollTo(...args);
    };
  });
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await expect.poll(() =>
    page.evaluate(() =>
      (window as typeof window & { catalogueScrollCalls: number }).catalogueScrollCalls,
    ),
  ).toBe(1);
  await page.evaluate(() => {
    (window as typeof window & { catalogueScrollCalls: number }).catalogueScrollCalls = 0;
  });

  await page.waitForTimeout(350);
  expect(
    await page.evaluate(() =>
      (window as typeof window & { catalogueScrollCalls: number }).catalogueScrollCalls,
    ),
  ).toBe(0);
});

test('shows all category chips at the top and compacts them after scrolling', async ({ page }) => {
  const categories = page.getByLabel('Product categories');
  await expect(categories).toHaveClass(/flex-wrap/);
  await expect(categories).not.toHaveClass(/overflow-x-auto/);

  await page.evaluate(() => window.scrollTo(0, 700));
  if (test.info().project.name === 'mobile-chromium') {
    await expect(page.getByLabel('Product categories')).toHaveCount(1);
    const stickyCategories = page.getByLabel('Product categories');
    await expect(stickyCategories).toHaveClass(/overflow-x-auto/);
    await expect(stickyCategories).not.toHaveClass(/justify-center overflow-visible/);
  } else {
    await expect(page.getByLabel('Product categories')).toHaveCount(1);
  }

  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.getByLabel('Product categories')).toHaveCount(1);
  await expect(categories).toHaveClass(/flex-wrap/);
  await expect(categories).not.toHaveClass(/overflow-x-auto/);
});

test('allows uninterrupted upward scrolling past the mobile sticky controls', async ({ page }) => {
  test.skip(test.info().project.name !== 'mobile-chromium');
  await page.evaluate(() => window.scrollTo(0, 900));
  await expect(page.getByLabel('Product categories')).toHaveCount(1);

  await page.mouse.wheel(0, -2000);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(5);
  await expect(page.getByLabel('Product categories')).toHaveCount(1);
});

test('previews product variants from the landing card without opening details', async ({
  page,
}) => {
  const roseCard = page.getByRole('article', { name: 'Product: Rose Charm' });
  const ivoryPreview = roseCard.getByRole('button', {
    name: 'Show Ivory variant image for Rose Charm',
  });
  await ivoryPreview.click();
  await expect(ivoryPreview).toHaveAttribute('aria-pressed', 'true');
  await expect(
    roseCard.getByRole('button', {
      name: 'Show Rose Pink variant image for Rose Charm',
    }),
  ).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('dialog', { name: 'Rose Charm' })).toHaveCount(0);
});

test('uses a selected variant price in the card, modal, and cart', async ({ page }) => {
  catalogueState.products[0].product_variants[1].in_stock = true;
  catalogueState.products[0].product_variants[1].available_quantity = 2;
  catalogueState.products[0].product_variants[1].price = 499;
  await page.reload({ waitUntil: 'domcontentloaded' });

  const roseCard = page.getByRole('article', { name: 'Product: Rose Charm' });
  await roseCard.getByRole('button', {
    name: 'Show Ivory variant image for Rose Charm',
  }).click();
  await expect(roseCard.getByText('₹499')).toBeVisible();
  await roseCard.getByRole('button', { name: 'View Rose Charm' }).click();

  const productDialog = page.getByRole('dialog', { name: 'Rose Charm' });
  await productDialog.locator('button[aria-pressed]').filter({ hasText: 'Ivory' }).click();
  await expect(productDialog.getByText('₹499')).toBeVisible();
  await productDialog.getByRole('button', { name: 'Add to cart — Rose Charm' }).click();
  await productDialog.getByRole('button', { name: 'Close', exact: true }).click();

  await page.getByRole('button', { name: 'Open cart with 1 item' }).click();
  const cartDialog = page.getByRole('dialog', { name: 'Shopping cart' });
  await expect(cartDialog.getByText('Variant: Ivory')).toBeVisible();
  await expect(
    cartDialog.getByRole('article', { name: 'View Rose Charm — Ivory' }).getByText('₹499'),
  ).toBeVisible();
});

test('hides the Standard label for a single-variant product', async ({ page }) => {
  const heartCard = page.getByRole('article', { name: 'Product: New Heart Charm' });
  await heartCard.getByRole('button', { name: 'Add to cart — New Heart Charm' }).click();
  await expect(page.getByRole('status')).toContainText('New Heart Charm added to cart');
  await expect(page.getByRole('status')).not.toContainText('Standard');

  await page.getByRole('button', { name: 'Open cart with 1 item' }).click();
  const cartDialog = page.getByRole('dialog', { name: 'Shopping cart' });
  await expect(cartDialog.getByRole('article', { name: 'View New Heart Charm' })).toBeVisible();
  await expect(cartDialog.getByText('Variant: Standard')).toHaveCount(0);
});

test('opens the exact cart product variant in the product modal', async ({ page }) => {
  catalogueState.products[0].product_variants[1].in_stock = true;
  catalogueState.products[0].product_variants[1].available_quantity = 2;
  await page.reload({ waitUntil: 'domcontentloaded' });

  await page.getByRole('button', { name: 'View Rose Charm' }).click();
  let productDialog = page.getByRole('dialog', { name: 'Rose Charm' });
  const ivoryVariant = productDialog.locator('button[aria-pressed]').filter({ hasText: 'Ivory' });
  await ivoryVariant.click();
  await productDialog.getByRole('button', { name: 'Add to cart — Rose Charm' }).click();
  await productDialog.getByRole('button', { name: 'Close', exact: true }).click();

  await page.getByRole('button', { name: 'Open cart with 1 item' }).click();
  const cartDialog = page.getByRole('dialog', { name: 'Shopping cart' });
  await cartDialog.locator('article[aria-label="View Rose Charm — Ivory"]').click();

  productDialog = page.getByRole('dialog', { name: 'Rose Charm' });
  await expect(
    productDialog.locator('button[aria-pressed]').filter({ hasText: 'Ivory' }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(productDialog.getByRole('img', { name: 'Rose Charm — Ivory' })).toBeVisible();
  await expect(cartDialog).toHaveCount(0);
  await productDialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Shopping cart' })).toBeVisible();
});

test('shares a product through app icons and direct social links', async ({
  page,
}) => {
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data: ShareData) => {
        (window as unknown as { lastSharedProduct: ShareData }).lastSharedProduct = data;
      },
    });
  });

  await page.getByRole('button', { name: 'View Rose Charm' }).click();
  const dialog = page.getByRole('dialog', { name: 'Rose Charm' });
  await dialog.getByRole('button', { name: 'Share this product' }).click();

  await expect(dialog.getByRole('link', { name: 'Share on WhatsApp' })).toHaveAttribute(
    'href',
    /wa\.me.*rose-charm--product-1/i,
  );
  await expect(dialog.getByRole('link', { name: 'Share on Facebook' })).toHaveAttribute(
    'href',
    /facebook\.com\/sharer\/sharer\.php.*rose-charm--product-1/i,
  );
  await expect(dialog.getByRole('link', { name: 'Share on Reddit' })).toHaveAttribute(
    'href',
    /reddit\.com\/submit.*rose-charm--product-1/i,
  );
  await expect(dialog.getByRole('button', { name: 'Share on Instagram' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Share on Snapchat' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Copy product link' })).toBeVisible();
  await expect(dialog.getByText(/Instagram and Snapchat open your device share menu/)).toBeVisible();

  await dialog.getByRole('button', { name: 'Share to apps' }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { lastSharedProduct?: ShareData }).lastSharedProduct,
      ),
    )
    .toMatchObject({
      title: 'Rose Charm — Rose Pink',
      text: 'See Rose Charm — Rose Pink from Luvia',
      url: expect.stringContaining('#product=rose-charm--product-1'),
    });

  await dialog.getByRole('button', { name: 'Share on Instagram' }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { lastSharedProduct?: ShareData }).lastSharedProduct,
      ),
    )
    .toMatchObject({
      url: expect.stringContaining('#product=rose-charm--product-1'),
    });
});

test('positions the cart below the ticker and floats it after an item is added', async ({
  page,
}) => {
  const ticker = page.getByLabel('Store announcements');
  const cartButton = page.getByRole('button', { name: 'Open cart with 0 items' });
  await expect(cartButton).toHaveText('');
  const logo = page.getByRole('img', {
    name: 'Luvia — Crochet, Accessories & More, made with love',
  });

  const [tickerBox, cartBox, logoBox] = await Promise.all([
    ticker.boundingBox(),
    cartButton.boundingBox(),
    logo.boundingBox(),
  ]);

  expect(tickerBox).not.toBeNull();
  expect(cartBox).not.toBeNull();
  expect(logoBox).not.toBeNull();
  expect(cartBox!.y).toBeGreaterThanOrEqual(tickerBox!.y + tickerBox!.height);
  expect(cartBox!.x + cartBox!.width).toBeGreaterThan(logoBox!.x + logoBox!.width);
  expect(cartBox!.y).toBeLessThan(logoBox!.y + logoBox!.height);

  const roseCard = page.getByRole('article').filter({
    has: page.getByRole('heading', { name: 'Rose Charm' }),
  });
  await roseCard.getByRole('button', { name: 'Add to cart — Rose Charm' }).click();
  const floatingCart = page.getByRole('button', { name: 'Open cart with 1 item' });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const floatingBox = await floatingCart.boundingBox();
  expect(floatingBox).not.toBeNull();
  expect(floatingBox!.y).toBeGreaterThanOrEqual(40);
  expect(floatingBox!.y).toBeLessThanOrEqual(60);
  expect(floatingBox!.x + floatingBox!.width).toBeGreaterThan(logoBox!.x + logoBox!.width);
});

test('rotates active storefront ticker messages and excludes inactive messages', async ({
  page,
}) => {
  const ticker = page.getByLabel('Store announcements');
  await expect(ticker).toContainText('Shipping available across India');
  await expect(ticker).not.toContainText('Hidden ticker message');

  await expect
    .poll(() => ticker.textContent(), { timeout: 8000 })
    .toContain('Fresh crochet gifts added weekly');
  await expect(ticker).not.toContainText('Hidden ticker message');
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
  await expect.poll(() => catalogueState.carts.length).toBe(0);
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
  await expect(page.getByLabel('Store announcements')).toBeVisible();
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

  const nextDescription = page
    .getByRole('dialog', { name: 'New Heart Charm' })
    .getByText('A newly published crochet heart charm.');
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
