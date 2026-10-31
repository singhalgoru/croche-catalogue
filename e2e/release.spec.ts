import { expect, test } from '@playwright/test';
import { installMockSupabase } from './mockSupabase';
import { readFileSync } from 'node:fs';

const makingVideoUrl = 'https://videos.luviacreations.com/making-videos/release/video.mp4';
const makingPosterUrl = 'https://videos.luviacreations.com/making-videos/release/poster.webp';
// Locally generated two-second H.264 colour fixture; release tests need no encoder.
const makingVideoBytes = readFileSync(new URL('./fixtures/making-video.mp4', import.meta.url));

test.beforeEach(async ({ page }) => {
  await installMockSupabase(page);
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Shop the Collection' })).toBeVisible();
});

test('section anchors land below sticky controls on PWA launches, reloads and history navigation', async ({ page }) => {
  const expectAnchored = async (id: string) => {
    await expect.poll(() => page.locator(`#${id}`).evaluate(element => {
      const desired = Number.parseFloat(getComputedStyle(element).scrollMarginTop);
      return Math.abs(element.getBoundingClientRect().top - desired);
    })).toBeLessThan(3);
  };
  await page.route('**/rest/v1/products?*', async route => {
    await new Promise(resolve => setTimeout(resolve, 300));
    await route.fallback();
  });
  for (const id of ['collaborate', 'bulk-orders', 'products']) {
    await page.goto(`./?utm_source=pwa&utm_medium=app#${id}`);
    await expect(page.getByRole('button', { name: 'View Rose Charm' })).toBeAttached();
    await expectAnchored(id);
    expect(new URL(page.url()).search).toBe('?utm_source=pwa&utm_medium=app');
    await page.reload();
    await expectAnchored(id);
  }
  await page.evaluate(() => { location.hash = 'collaborate'; });
  await expectAnchored('collaborate');
  await page.evaluate(() => { location.hash = 'products'; });
  await expectAnchored('products');
  await page.goBack();
  await expect(page).toHaveURL(/#collaborate$/);
  await expectAnchored('collaborate');
  await page.goForward();
  await expectAnchored('products');
  await page.getByRole('button', { name: 'View Rose Charm' }).click();
  await expect(page.getByRole('heading', { name: 'Rose Charm', level: 1 })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/#products$/);
  await expectAnchored('products');
});

test('home page opens a product page with current purchase actions', async ({ page }) => {
  await page.getByRole('button', { name: 'View Rose Charm' }).click();
  await expect(page).toHaveURL(/\/p\/rose-charm\/$/);
  await expect(page.getByRole('heading', { name: 'Rose Charm', level: 1 })).toBeVisible();
  const purchase = page.getByLabel('Product purchase actions', { exact: true });
  await expect(purchase).toBeVisible();
  await expect(purchase.getByRole('button', { name: 'Share this product' })).toBeVisible();
  await expect(purchase.getByRole('link', { name: 'Ask on WhatsApp' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Delivery and returns' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Making video', exact: true })).toHaveCount(0);
});

test('watch pages use compact branding with the shared header and footer and keep video deferred', async ({ page }) => {
  const state = await installMockSupabase(page);
  state.products[0].product_making_videos = {
    video_url: makingVideoUrl, poster_url: makingPosterUrl, duration_seconds: 2, width: 320, height: 180,
  };
  const headerBackground = await page.locator('header').evaluate(element => getComputedStyle(element).backgroundColor);
  const footerStyle = await page.locator('footer').evaluate(element => getComputedStyle(element).backgroundColor);
  const requests: string[] = [];
  page.on('request', request => { if (request.url() === makingVideoUrl) requests.push(request.url()); });
  await page.goto('/watch/rose-charm/', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Making Rose Charm', level: 1 })).toBeVisible();
  expect(await page.locator('header').evaluate(element => ({
    background: getComputedStyle(element).backgroundColor,
    logoWidth: element.querySelector('img')!.getBoundingClientRect().width,
  }))).toEqual({ background: headerBackground, logoWidth: 48 });
  const logo = (await page.getByRole('link', { name: 'Luvia Creations — home' }).boundingBox())!;
  if (page.viewportSize()!.width < 640) expect(logo.x).toBe(16);
  expect(await page.locator('footer').evaluate(element => getComputedStyle(element).backgroundColor)).toBe(footerStyle);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  await page.getByRole('button', { name: 'Close navigation' }).click();
  const information = page.getByRole('button', { name: 'Help & information' });
  if (await information.isVisible()) {
    await information.click();
    await expect(information).toHaveAttribute('aria-expanded', 'true');
  }
  await expect(page.locator('footer').getByRole('link', { name: 'Contact on Instagram' })).toBeVisible();
  await expect(page.locator('main video')).toHaveAttribute('preload', 'none');
  expect(requests).toHaveLength(0);
});

test('video badges navigate to the video section and start muted playback after a tap', async ({ page }) => {
  const state = await installMockSupabase(page);
  state.products[0].product_making_videos = {
    video_url: makingVideoUrl, poster_url: state.products[0].image_url, duration_seconds: 2, width: 320, height: 180,
  };
  await page.route(makingVideoUrl, route => route.fulfill({
    contentType: 'video/mp4', body: makingVideoBytes,
  }));
  for (const route of ['/', '/featured/', '/collections/charms/']) {
    await page.goto(route);
    const card = page.getByRole('article', { name: 'Product: Rose Charm' });
    await card.getByRole('link', { name: 'Watch making video for Rose Charm' }).click();
    await expect(page).toHaveURL(/\/p\/rose-charm\/\?watch=making-video#making-video$/);
    const section = page.getByRole('region', { name: 'Making video', exact: true });
    await expect(section).toBeInViewport();
    await expect.poll(() => section.locator('video').evaluate(video => ({
      muted: video.muted, played: video.currentTime > 0,
    }))).toEqual({ muted: true, played: true });
  }
  await page.goto('/');
  await page.getByRole('region', { name: 'Featured products', exact: true })
    .getByRole('link', { name: 'Watch making video for Rose Charm' }).click();
  await expect(page.getByRole('region', { name: 'Making video', exact: true })).toBeInViewport();
  await expect.poll(() => page.locator('video').evaluate(video => video.currentTime)).toBeGreaterThan(0);
});

test('optional making video requests no media before a tap and plays inline without changing product photos', async ({ page }) => {
  const state = await installMockSupabase(page);
  state.products[0].product_making_videos = {
    video_url: makingVideoUrl, poster_url: makingPosterUrl, duration_seconds: 2, width: 320, height: 180,
  };
  const requests: string[] = [];
  page.on('request', request => {
    if (request.url() === makingVideoUrl) requests.push(request.url());
  });
  await page.route(makingPosterUrl, route => route.fulfill({ status: 200, contentType: 'image/png',
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4l8AAAAASUVORK5CYII=', 'base64') }));
  await page.route(makingVideoUrl, route => route.fulfill({ status: 200, contentType: 'video/mp4',
    headers: { 'Accept-Ranges': 'bytes' }, body: makingVideoBytes }));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'View Rose Charm' }).click();
  const making = page.getByRole('region', { name: 'Making video', exact: true });
  await expect(making).toBeVisible();
  await expect(making.locator('video')).toHaveCount(1);
  await expect(making.locator('video')).toHaveAttribute('preload', 'none');
  await expect(making.getByRole('button', { name: 'Play making video for Rose Charm' })).toBeVisible();
  await expect(making.getByRole('img', { name: 'Preview of Rose Charm being made' })).toBeVisible();
  await expect.poll(() => making.locator('img').evaluate(image => image.naturalWidth)).toBeGreaterThan(0);
  expect(await making.locator('img').evaluate(element =>
    element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })))).toBe(false);
  await expect(making.locator('img')).toHaveAttribute('draggable', 'false');
  await page.evaluate(() => Object.defineProperty(navigator, 'share', {
    configurable: true,
    value: async (data: ShareData) => document.body.setAttribute('data-video-share-url', data.url ?? ''),
  }));
  await making.getByRole('button', { name: 'Share making video' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-video-share-url', /\/p\/[^/]+\/\?watch=making-video#making-video$/);
  await expect(making.locator('video')).toHaveCount(1);
  expect(requests).toHaveLength(0);
  const photos = await page.locator('img[alt^="Rose Charm"]').evaluateAll(images =>
    images.map(image => image.getAttribute('src')));
  await making.getByRole('button', { name: 'Play making video for Rose Charm' }).click();
  const video = making.locator('video');
  await expect(video).toHaveAttribute('src', makingVideoUrl);
  await expect(video).toHaveAttribute('preload', 'none');
  await expect(video).toHaveAttribute('controlslist', 'nodownload');
  await expect(video).toHaveAttribute('draggable', 'false');
  expect(await video.evaluate(element =>
    element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })))).toBe(false);
  await expect(video).not.toHaveAttribute('autoplay', '');
  await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).currentTime), { timeout: 15_000 })
    .toBeGreaterThan(0);
  expect(requests.length).toBeGreaterThan(0);
  expect(await video.evaluate(element => (element as HTMLVideoElement).playsInline)).toBe(true);
  expect(await page.locator('img[alt^="Rose Charm"]').evaluateAll(images =>
    images.map(image => image.getAttribute('src')))).toEqual(photos);
  const sharedUrl = await page.locator('body').getAttribute('data-video-share-url');
  await page.goto(sharedUrl!);
  const sharedVideo = page.getByRole('region', { name: 'Making video', exact: true }).locator('video');
  await expect(sharedVideo).toBeVisible();
  await expect.poll(() => sharedVideo.evaluate(element => (element as HTMLVideoElement).currentTime),
    { timeout: 15_000 }).toBeGreaterThan(0);
  expect(await sharedVideo.evaluate(element => (element as HTMLVideoElement).muted)).toBe(true);
  await expect(page.getByRole('button', { name: 'Turn sound on' })).toBeVisible();
  const bounds = await sharedVideo.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeLessThan(300);
  const legacyUrl = new URL(sharedUrl!);
  legacyUrl.search = '';
  await page.goto(legacyUrl.href);
  await expect(page).toHaveURL(/#making-video$/);
  const legacyVideo = page.locator('#making-video video');
  await expect(legacyVideo).toBeVisible();
  await expect.poll(() => legacyVideo.evaluate(element => (element as HTMLVideoElement).currentTime),
    { timeout: 15_000 }).toBeGreaterThan(0);
});

test('making-video playback errors offer retry while purchase actions remain usable', async ({ page }) => {
  const state = await installMockSupabase(page);
  state.products[0].product_making_videos = {
    video_url: makingVideoUrl, poster_url: makingPosterUrl, duration_seconds: 2, width: 320, height: 180,
  };
  await page.route(makingPosterUrl, route => route.fulfill({ status: 204, body: '' }));
  await page.route(makingVideoUrl, route => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'View Rose Charm' }).click();
  const making = page.getByRole('region', { name: 'Making video', exact: true });
  await making.getByRole('button', { name: 'Play making video for Rose Charm' }).click();
  await expect(making.getByRole('alert')).toContainText('could not be played');
  await making.getByRole('button', { name: 'Retry video' }).click();
  await expect(making.locator('video')).toHaveCount(1);
  await expect(making.getByRole('button', { name: 'Play making video for Rose Charm' })).toBeVisible();
  await expect(page.getByLabel('Product purchase actions', { exact: true }).getByRole('link', { name: 'Ask on WhatsApp' }))
    .toBeVisible();
});

test('private signed native video preview plays cross-origin without any bucket CORS headers', async ({ page }) => {
  const privateUrl = 'https://private-fixture.r2.cloudflarestorage.com/private/making-videos/review/video.mp4?X-Amz-Expires=300&X-Amz-Signature=fixture';
  const posterUrl = privateUrl.replace('video.mp4', 'poster.webp');
  const requests: string[] = [];
  await page.route(privateUrl, route => {
    requests.push(route.request().url());
    return route.fulfill({
      status: 200, contentType: 'video/mp4', body: makingVideoBytes,
      // Intentionally no Access-Control-Allow-Origin or other CORS headers.
      headers: { 'Cache-Control': 'private, no-store', 'Accept-Ranges': 'bytes' },
    });
  });
  await page.route(posterUrl, route => route.fulfill({
    status: 200, contentType: 'image/png',
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4l8AAAAASUVORK5CYII=', 'base64'),
  }));
  // Match ProductVideoManager's native preview attributes; do not add crossorigin,
  // fetch media bytes in JS, or draw frames into a readable canvas.
  await page.evaluate(({ privateUrl, posterUrl }) => {
    const region = document.createElement('section');
    region.setAttribute('aria-label', 'Private preview CORS verification');
    const video = document.createElement('video');
    video.src = privateUrl; video.poster = posterUrl;
    video.controls = true; video.playsInline = true; video.preload = 'none';
    video.width = 320; video.height = 180;
    const play = document.createElement('button');
    play.textContent = 'Play private preview fixture';
    play.addEventListener('click', () => { void video.play(); });
    region.append(video, play); document.body.prepend(region);
  }, { privateUrl, posterUrl });
  const region = page.getByRole('region', { name: 'Private preview CORS verification' });
  const video = region.locator('video');
  await expect(video).not.toHaveAttribute('crossorigin');
  await region.getByRole('button', { name: 'Play private preview fixture' }).click();
  await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).currentTime), { timeout: 15_000 })
    .toBeGreaterThan(0);
  expect(requests.length).toBeGreaterThan(0);
  expect(await video.evaluate(element => (element as HTMLVideoElement).crossOrigin)).toBeNull();
});

test('cart drawer opens from the catalogue and starts the delivery flow', async ({ page }) => {
  const card = page.getByRole('article', { name: 'Product: Rose Charm' });
  await card.getByRole('button', { name: 'Add to cart — Rose Charm' }).click();
  await expect(page.getByRole('button', { name: 'Open cart with 1 item', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open cart with 1 item', exact: true }).click();
  await expect(page.getByText('Rose Charm — Rose Pink')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue with delivery details' })).toBeVisible();
});

test('collection pages show products, sharing and the go-to-top button', async ({ page }) => {
  await page.goto('/collections/charms/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Handmade Charms', exact: true })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Product: Rose Charm' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Share Charms collection' })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const goToTop = page.getByRole('button', { name: 'Go to top' });
  await expect(goToTop).toBeVisible();
  await goToTop.click({ timeout: 10_000 });
  await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 15_000 }).toBeLessThan(10);
});

test('feedback page keeps its storefront navigation and back-to-top control', async ({ page }) => {
  await page.goto('./?page=feedback', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Share feedback', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to shop' })).toHaveAttribute('href', '/');
  await page.evaluate(() => {
    document.body.style.minHeight = '4000px';
    window.scrollTo(0, 900);
  });
  const goToTop = page.getByRole('button', { name: 'Go to top' });
  await expect(goToTop).toBeVisible();
  await goToTop.click({ timeout: 10_000 });
  await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 15_000 }).toBeLessThan(10);
});

test('product labour overrides persist and prefill an independently editable sale rate', async ({ page }) => {
  const state = await installMockSupabase(page);
  let pricing: Record<string, string | number | null> = { profit_margin_percent: null, gst_percent: 5, time_spent: 90, time_unit: 'minutes',
    labour_rate: null, material_cost: 50, shipping_cost: 100, packaging_cost: 10, target_margin_percent: 35 };
  await page.route('**/rest/v1/products?*', async route => {
    if (route.request().method() !== 'GET') { await route.fallback(); return; }
    const url = new URL(route.request().url());
    const id = url.searchParams.get('id')?.replace('eq.', '');
    const products = state.products.filter(product => !id || product.id === id).map(product => ({
      ...product, product_profit_margins: product.id === 'product-1' ? pricing : null,
    }));
    await route.fulfill({ json: route.request().headers().accept?.includes('application/vnd.pgrst.object') ? products[0] : products });
  });

  await page.route('**/rest/v1/product_profit_margins*', async route => {
    pricing = { ...pricing, ...route.request().postDataJSON() };
    await route.fulfill({ json: null });
  });
  await page.route('**/rest/v1/seller_sales*', route => route.fulfill({ json: [] }));
  await page.route('**/rest/v1/business_expenses*', route => route.fulfill({ json: [] }));
  const orders: Record<string, unknown>[] = [];
  await page.route('**/rest/v1/rpc/create_seller_order', async route => {
    orders.push(route.request().postDataJSON()); await route.fulfill({ json: 'saved-order' });
  });
  await page.goto('./#admin');
  await page.getByLabel('Email', { exact: true }).fill('admin@luvia.test');
  await page.getByLabel('Password', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: /Manage products/ }).click();
  const product = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Rose Charm', exact: true }) });
  await product.getByRole('button', { name: /Price discovery/ }).click();
  await expect(product.getByText(/Labour cost per piece:/)).toHaveText('Labour cost per piece: ₹150');
  await page.getByLabel('Rose Charm labour rate per hour').fill('180');
  await expect(product.getByText(/Labour cost per piece:/)).toHaveText('Labour cost per piece: ₹270');
  await product.getByRole('button', { name: 'Save values for this product' }).click();
  await expect(product.getByText('Price discovery values saved for this product.')).toBeVisible();
  expect(pricing.labour_rate).toBe(180);
  await page.getByRole('button', { name: 'Sales', exact: true }).click();
  await page.getByRole('button', { name: /Sales dashboard/ }).click();
  await page.getByRole('button', { name: 'Record sale', exact: true }).click();
  await page.getByLabel('Sale product', { exact: true }).selectOption('product-1');
  await expect(page.getByLabel('Sale labour rate per hour')).toHaveValue('180');
  await expect(page.getByLabel('Labour per piece (₹)', { exact: true })).toHaveValue('270');
  await page.getByLabel('Sale labour rate per hour').fill('200');
  await expect(page.getByLabel('Labour per piece (₹)', { exact: true })).toHaveValue('300');
  await page.getByRole('button', { name: 'Save sale', exact: true }).click();
  await expect(page.getByText('Sale recorded.', { exact: true })).toBeVisible();
  expect(orders[0]).toMatchObject({ p_items: [expect.objectContaining({
    labour_cost: 300, labour_rate: 200, labour_time_spent: 90, labour_time_unit: 'minutes',
  })] });
  expect(pricing.labour_rate).toBe(180);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('recurring business expenses generate a due entry and can be paused and resumed', async ({ page }) => {
  await installMockSupabase(page);
  const expenses: Record<string, unknown>[] = [];
  const schedules: Record<string, unknown>[] = [];
  const creations: Record<string, unknown>[] = [];
  const toggles: Record<string, unknown>[] = [];
  await page.route('**/rest/v1/seller_sales*', route => route.fulfill({ json: [] }));
  await page.route('**/rest/v1/business_expenses*', route => route.fulfill({ json: expenses }));
  await page.route('**/rest/v1/recurring_business_expenses*', route => route.fulfill({ json: schedules }));
  await page.route('**/rest/v1/rpc/create_recurring_business_expense', async route => {
    const body = route.request().postDataJSON(); creations.push(body);
    const next = new Date(`${body.start_date}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 14);
    schedules.push({ id: body.request_id, description: body.expense_description, category: body.expense_category,
      amount: body.expense_amount, notes: body.expense_notes, starts_on: body.start_date, ends_on: body.end_date,
      frequency_unit: body.repeat_unit, frequency_interval: body.repeat_interval, active: true,
      version: 1, next_due: next.toISOString().slice(0, 10) });
    expenses.push({ id: 'generated-expense', description: body.expense_description, expense_date: body.start_date,
      category: body.expense_category, amount: body.expense_amount, notes: body.expense_notes,
      recurring_expense_id: body.request_id, recurring_date: body.start_date });
    await route.fulfill({ json: body.request_id });
  });
  await page.route('**/rest/v1/rpc/set_recurring_business_expense_active', async route => {
    const body = route.request().postDataJSON(); toggles.push(body);
    expect(body.expected_version).toBe(schedules[0].version);
    schedules[0].active = body.enabled; schedules[0].version = Number(schedules[0].version) + 1;
    await route.fulfill({ json: body.schedule_id });
  });
  await page.goto('./#admin');
  await page.getByLabel('Email', { exact: true }).fill('admin@luvia.test');
  await page.getByLabel('Password', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Sales', exact: true }).click();
  await page.getByRole('button', { name: /Sales dashboard/ }).click();
  await page.getByRole('button', { name: 'Business expenses', exact: true }).click();
  await page.getByRole('button', { name: 'Add recurring expense', exact: true }).click();
  await page.getByLabel('Recurring expense description').fill('Website hosting');
  await page.getByLabel('Recurring expense amount (INR)').fill('125.50');
  await page.getByLabel('Repeat every', { exact: true }).fill('2');
  await page.getByLabel('Frequency', { exact: true }).selectOption('weeks');
  await page.getByRole('button', { name: 'Save recurring expense', exact: true }).click();
  await expect(page.getByText('Recurring expense saved. Due entries appear in the expense list; future entries are automatic.', { exact: true })).toBeVisible();
  expect(creations).toHaveLength(1);
  expect(creations[0]).toMatchObject({ expense_amount: 125.5, repeat_interval: 2, repeat_unit: 'weeks', end_date: null });
  await expect(page.getByRole('button', { name: 'Edit expense Website hosting', exact: true })).toBeVisible();
  await expect(page.getByText(/Generated by a recurring schedule/)).toBeVisible();
  await page.getByRole('button', { name: 'Pause Website hosting', exact: true }).click();
  await expect(page.getByText('Schedule paused. Existing expenses are unchanged.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Resume Website hosting', exact: true }).click();
  await expect(page.getByText('Schedule resumed. Paused dates were skipped.', { exact: true })).toBeVisible();
  expect(toggles).toMatchObject([{ enabled: false, expected_version: 1 }, { enabled: true, expected_version: 2 }]);
  expect(expenses).toHaveLength(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
