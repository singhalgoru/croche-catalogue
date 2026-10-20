import { expect, test } from '@playwright/test';
import { installMockSupabase } from './mockSupabase';
import { execFileSync } from 'node:child_process';

const makingVideoUrl = 'https://videos.luviacreations.com/making-videos/release/video.mp4';
const makingPosterUrl = 'https://videos.luviacreations.com/making-videos/release/poster.webp';
let makingVideoBytes: Buffer;
test.beforeAll(() => {
  // Entirely local synthetic H.264 fixture; no remote reads, writes or scratch files.
  makingVideoBytes = execFileSync('ffmpeg', ['-nostdin', '-v', 'error',
    '-f', 'lavfi', '-i', 'color=c=red:s=320x180:r=24', '-t', '2',
    '-an', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    '-movflags', 'frag_keyframe+empty_moov', '-f', 'mp4', 'pipe:1']);
});

test.beforeEach(async ({ page }) => {
  await installMockSupabase(page);
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Shop the Collection' })).toBeVisible();
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
  await expect(making.locator('video,source')).toHaveCount(0);
  await expect(making.getByRole('button', { name: 'Play making video for Rose Charm' })).toBeVisible();
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
  await expect(making.locator('video,source')).toHaveCount(0);
  expect(requests).toHaveLength(0);
  const photos = await page.locator('img[alt*="Rose Charm"]').evaluateAll(images =>
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
  expect(await page.locator('img[alt*="Rose Charm"]').evaluateAll(images =>
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
  await expect(making.locator('video')).toHaveCount(0);
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
