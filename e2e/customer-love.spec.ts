import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { installMockSupabase } from './mockSupabase';

test('extracts review text locally without uploading the image or publishing it', async ({ page }) => {
  test.setTimeout(90000);
  await installMockSupabase(page);
  const ocrRequests: string[] = [];
  const imageUploads: string[] = [];
  let extracting = false;
  page.on('request', request => {
    if (/tesseract|traineddata|worker\.min/.test(request.url())) ocrRequests.push(request.url());
    if (extracting && !['GET', 'HEAD'].includes(request.method())) imageUploads.push(request.url());
  });
  await page.goto('./#admin');
  await page.getByLabel('Email', { exact: true }).fill('admin@luvia.test');
  await page.getByLabel('Password', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Customer Love', exact: true }).click();
  await page.getByRole('button', { name: 'Add testimonial', exact: true }).click();
  await page.getByText('Extract quote from a photo', { exact: true }).click();
  const image = await sharp(Buffer.from('<svg width="1000" height="180"><rect width="100%" height="100%" fill="white"/><text x="35" y="100" font-family="Arial" font-size="48" fill="black">Such a beautiful handmade gift!</text></svg>')).png().toBuffer();
  await page.getByLabel('Review image for text extraction').setInputFiles({ name: 'synthetic-review.png', mimeType: 'image/png', buffer: image });
  extracting = true;
  await page.getByRole('button', { name: 'Extract text on this device', exact: true }).click();
  const review = page.getByLabel('Review extracted text', { exact: true });
  await expect(review).toHaveValue(/beautiful handmade gift/i, { timeout: 60000 });
  await expect(page.getByLabel('Customer quote', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Use reviewed text as quote', exact: true }).click();
  await expect(page.getByLabel('Customer quote', { exact: true })).toHaveValue(/beautiful handmade gift/i);
  await expect(page.getByLabel('Visibility')).toHaveValue('draft');
  expect(ocrRequests.length).toBeGreaterThanOrEqual(3);
  expect(ocrRequests.every(url => new URL(url).origin === 'http://127.0.0.1:4187')).toBe(true);
  expect(imageUploads).toEqual([]);
  expect(await page.getByLabel('Customer photo (optional)').inputValue()).toBe('');
});

test('the Customer Love page shows a photo-led hero, a masonry gallery and a share invitation', async ({ page }, testInfo) => {
  const catalogue = await installMockSupabase(page);
  const photo = await sharp({ create: { width: 800, height: 1000, channels: 3, background: '#f3cf74' } }).webp().toBuffer();
  await page.route('https://images.luviacreations.com/customer-reviews/**', route => route.fulfill({ body: photo, contentType: 'image/webp' }));
  const story = (index: number, extra: object) => ({ id: `10000000-0000-4000-8000-00000000001${index}`, display_name: `Synthetic story ${index}, Meerut`,
    quote: 'A lovely handmade keepsake that we use every day. '.repeat(index === 2 ? 8 : 1), product_ids: [catalogue.products[0].id],
    has_image: false, image_url: null, image_alt: '', featured: false, sort_order: index, ...extra });
  const withPhoto = (index: number) => ({ has_image: true, image_alt: `Synthetic photo ${index}`,
    image_url: `https://images.luviacreations.com/customer-reviews/10000000-0000-4000-8000-00000000001${index}-0123456789abcdef.webp` });
  await page.route('**/rest/v1/rpc/list_customer_love', route => route.fulfill({ json: [
    story(1, {}), story(2, { featured: true, ...withPhoto(2) }), story(3, withPhoto(3)), story(4, {}),
  ] }));
  await page.goto('./customer-love/');
  await expect(page.getByText('Little moments, beautifully handmade')).toBeVisible();
  const hero = page.locator('#testimonial-10000000-0000-4000-8000-000000000012');
  await expect(hero.getByText('Featured story')).toBeVisible();
  await expect(hero.getByAltText('Synthetic photo 2')).toBeVisible();
  await expect(hero.getByRole('link', { name: 'Read full story from Synthetic story 2, Meerut' })).toHaveAttribute('href', '/customer-love/synthetic-story-2-meerut-10000000/');
  await expect(hero.getByRole('link', { name: `Shop ${catalogue.products[0].name}`, exact: true })).toBeVisible();
  const layout = await page.evaluate(() => {
    const heroImage = document.querySelector('#testimonial-10000000-0000-4000-8000-000000000012 img')!.getBoundingClientRect();
    const heroCard = document.querySelector('#testimonial-10000000-0000-4000-8000-000000000012')!.getBoundingClientRect();
    const cards = ['11', '13', '14'].map(id => document.querySelector(`#testimonial-10000000-0000-4000-8000-0000000000${id}`)!.getBoundingClientRect());
    return { photoShare: heroImage.width / heroCard.width, columns: new Set(cards.map(card => Math.round(card.left))).size,
      overflow: document.documentElement.scrollWidth > window.innerWidth };
  });
  expect(layout.overflow).toBe(false);
  if (testInfo.project.name === 'mobile-chromium') {
    expect(layout.photoShare).toBeGreaterThan(0.95);
    expect(layout.columns).toBe(1);
  } else {
    expect(layout.photoShare).toBeGreaterThan(0.5);
    expect(layout.photoShare).toBeLessThan(0.7);
    expect(layout.columns).toBe(2);
  }
  await expect(page.getByRole('link', { name: 'Share your experience' })).toHaveAttribute('href', /^https:\/\/wa\.me\//);
  await page.screenshot({ path: testInfo.outputPath('customer-love-gallery.png'), fullPage: true });
});

test('homepage "Loved by You" shows three stories: two columns on desktop, swipeable cards on mobile', async ({ page }, testInfo) => {
  const catalogue = await installMockSupabase(page);
  const photo = await sharp({ create: { width: 800, height: 1000, channels: 3, background: '#f3cf74' } }).webp().toBuffer();
  await page.route('https://images.luviacreations.com/customer-reviews/**', route => route.fulfill({ body: photo, contentType: 'image/webp' }));
  const story = (index: number, extra: object) => ({ id: `10000000-0000-4000-8000-00000000002${index}`, display_name: `Synthetic home ${index}, Meerut`,
    quote: 'A lovely handmade keepsake that we use every day. '.repeat(index), product_ids: [catalogue.products[0].id],
    has_image: false, image_url: null, image_alt: '', featured: true, sort_order: index, ...extra });
  await page.route('**/rest/v1/rpc/list_customer_love', route => route.fulfill({ json: [
    story(1, {}), story(2, { has_image: true, image_alt: 'Synthetic home photo',
      image_url: 'https://images.luviacreations.com/customer-reviews/10000000-0000-4000-8000-000000000022-0123456789abcdef.webp' }),
    story(3, {}), story(4, { featured: false }),
  ] }));
  await page.goto('./');
  const section = page.locator('section[aria-labelledby="loved-by-you-heading"]');
  await expect(section.getByRole('heading', { name: 'Loved by You' })).toBeVisible();
  await section.scrollIntoViewIfNeeded();
  const cards = section.getByRole('figure');
  await expect(cards).toHaveCount(3);
  await expect(cards.first().getByAltText('Synthetic home photo')).toBeVisible();
  await expect(section.getByText('Synthetic home 4')).toHaveCount(0);
  await expect(section.getByRole('link', { name: 'Read more customer stories' })).toHaveAttribute('href', '/customer-love/');
  await expect(cards.first().getByRole('link', { name: 'Read full story from Synthetic home 2, Meerut' }))
    .toHaveAttribute('href', '/customer-love/synthetic-home-2-meerut-10000000/');
  const layout = await cards.evaluateAll(elements => ({
    boxes: elements.map(element => { const box = element.getBoundingClientRect(); return { left: Math.round(box.left), width: box.width }; }),
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth || window.innerWidth > document.documentElement.clientWidth,
    scrollable: (() => { const track = elements[0].parentElement!; return track.scrollWidth > track.clientWidth; })(),
  }));
  expect(layout.overflow).toBe(false);
  if (testInfo.project.name === 'mobile-chromium') {
    expect(layout.scrollable).toBe(true);
    expect(new Set(layout.boxes.map(box => box.left)).size).toBe(3);
  } else {
    expect(layout.scrollable).toBe(false);
    expect(new Set(layout.boxes.map(box => box.left)).size).toBe(2);
    expect(layout.boxes[1].left).toBe(layout.boxes[2].left);
  }
  await section.getByRole('heading', { name: 'Loved by You' }).evaluate(element => element.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: testInfo.outputPath('loved-by-you.png') });
});

test('product page testimonial cards stay compact with photos, long quotes and multiple product tags', async ({ page }) => {
  const catalogue = await installMockSupabase(page);
  const photo = await sharp({ create: { width: 400, height: 900, channels: 3, background: '#f3cf74' } }).webp().toBuffer();
  await page.route('https://images.luviacreations.com/customer-reviews/**', route => route.fulfill({ body: photo, contentType: 'image/webp' }));
  await page.route('**/rest/v1/rpc/list_customer_love', route => route.fulfill({ json: [
    { id: '10000000-0000-4000-8000-000000000007', display_name: 'Synthetic photo customer',
      quote: 'Beautiful handmade gifts! '.repeat(30), product_ids: catalogue.products.map(product => product.id),
      has_image: true, image_url: 'https://images.luviacreations.com/customer-reviews/10000000-0000-4000-8000-000000000007-0123456789abcdef.webp',
      image_alt: 'Synthetic tall customer photo', featured: true, sort_order: 0 },
    { id: '10000000-0000-4000-8000-000000000008', display_name: 'Synthetic text customer',
      quote: 'A lovely handmade gift.', product_ids: [catalogue.products[0].id], has_image: false, image_url: null, image_alt: '', featured: true, sort_order: 1 },
  ] }));
  await page.goto('./customer-love/');
  await page.locator('#testimonial-10000000-0000-4000-8000-000000000007')
    .getByRole('link', { name: `Shop ${catalogue.products[0].name}`, exact: true }).click();
  await expect(page.getByRole('heading', { name: catalogue.products[0].name, level: 1 })).toBeVisible();
  const cards = page.getByRole('group', { name: 'Customer Love', exact: true }).locator(':scope > div:not([inert]) figure');
  await expect(cards).toHaveCount(2);
  await cards.first().scrollIntoViewIfNeeded();
  await expect(page.getByAltText('Synthetic tall customer photo', { exact: true }).first()).toBeVisible();
  expect(await page.getByAltText('Synthetic tall customer photo', { exact: true }).first()
    .evaluate(image => getComputedStyle(image).objectFit)).toBe('contain');
  const measurements = await cards.evaluateAll(elements => elements.map(element => {
    const bounds = element.getBoundingClientRect();
    const quote = element.querySelector('blockquote')!.getBoundingClientRect();
    const caption = element.querySelector('figcaption')!;
    const name = caption.getBoundingClientRect();
    const readMore = element.querySelector('a[aria-label^="Read full testimonial"]')!.getBoundingClientRect();
    return { height: bounds.height, quoteHeight: quote.height,
      nameVisible: name.height >= 20 && name.top >= readMore.bottom - 1 && name.bottom <= bounds.bottom
        && caption.scrollHeight <= caption.clientHeight + 1,
      linksFit: [...element.querySelectorAll('a')].every(link => link.getBoundingClientRect().bottom <= bounds.bottom) };
  }));
  expect(measurements.map(item => item.height)).toEqual([480, 480]);
  for (const item of measurements) {
    expect(item.quoteHeight).toBeLessThanOrEqual(72);
    expect(item.nameVisible).toBe(true);
    expect(item.linksFit).toBe(true);
  }
  await page.getByRole('link', { name: 'Read full testimonial from Synthetic photo customer', exact: true }).click();
  const fullImage = page.getByAltText('Synthetic tall customer photo', { exact: true });
  await expect(fullImage).toBeVisible();
  const fullSize = await fullImage.evaluate(image => {
    const bounds = image.getBoundingClientRect();
    return { ratio: bounds.height / bounds.width, fit: getComputedStyle(image).objectFit };
  });
  expect(fullSize.fit).toBe('contain');
  expect(fullSize.ratio).toBeCloseTo(900 / 400, 1);
});

test('long quote previews link to the complete testimonial after delayed loading', async ({ page }) => {
  await installMockSupabase(page);
  const id = '10000000-0000-4000-8000-000000000009';
  const quote = 'A lovely handmade keepsake. '.repeat(15) + 'This is the end of the complete customer story.';
  await page.route('**/rest/v1/rpc/list_customer_love', async route => {
    await new Promise(resolve => setTimeout(resolve, 300));
    await route.fulfill({ json: [{ id, display_name: 'Synthetic long story', quote, product_ids: [],
      has_image: false, image_url: null, image_alt: '', featured: true, sort_order: 0 }] });
  });
  await page.goto('./');
  await expect(page.getByRole('blockquote')).toContainText('This is the end');
  await expect(page.getByRole('blockquote')).toHaveClass(/line-clamp-4/);
  await page.getByRole('link', { name: 'Read full story from Synthetic long story', exact: true }).click();
  await expect(page).toHaveURL(/\/customer-love\/synthetic-long-story-10000000\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Customer story from Synthetic long story');
  const story = page.locator(`#testimonial-${id}`);
  await expect(story.getByRole('blockquote')).toHaveText(`“${quote}”`);
  await expect(page.getByRole('link', { name: 'See all customer stories' })).toBeVisible();
});

test('late-loading customer stories preserve product section anchor alignment', async ({ page }) => {
  await installMockSupabase(page);
  await page.route('**/rest/v1/rpc/list_customer_love', async route => {
    await new Promise(resolve => setTimeout(resolve, 700));
    await route.fulfill({ json: [{ id: '10000000-0000-4000-8000-000000000001', display_name: 'Synthetic late story',
      quote: 'A lovely handmade gift that arrived after the catalogue loaded.', product_ids: [],
      has_image: false, image_url: null, image_alt: '', featured: true, sort_order: 0 }] });
  });
  await page.goto('./#products');
  await expect(page.getByText('Synthetic late story', { exact: true })).toBeVisible();
  await expect.poll(() => page.locator('#products').evaluate(element =>
    Math.abs(element.getBoundingClientRect().top - parseFloat(getComputedStyle(element).scrollMarginTop)))).toBeLessThan(3);
});

test('admin drafts and publishes a permission-based photo story, then withdraws it from the website', async ({ page }) => {
  const catalogue = await installMockSupabase(page);
  const entries: Record<string, unknown>[] = [];
  const photos = new Map<string, string>();
  await page.route('**/rest/v1/rpc/list_customer_love', async route => {
    const admin = route.request().postDataJSON().admin_view;
    await route.fulfill({ json: admin ? entries : entries.filter(entry => entry.published && entry.consent_confirmed)
      .map(({ published: _published, consent_confirmed: _consent, consent_date: _date, consent_source: _source, version: _version, ...entry }) =>
        ({ ...entry, has_image: Boolean(entry.image_url) })) });
  });
  const r2Objects = new Map<string, string>();
  await page.route('**/rest/v1/rpc/save_customer_love', async route => {
    const body = route.request().postDataJSON();
    const previous = entries.find(entry => entry.id === body.testimonial_id);
    expect(body.expected_version).toBe(previous?.version ?? 0);
    const saved = { ...body.entry, image_url: null, version: body.expected_version + 1 };
    if (previous) Object.assign(previous, saved); else entries.push(saved);
    if (body.photo_base64) photos.set(saved.id, body.photo_base64);
    await route.fulfill({ json: body.testimonial_id });
  });
  await page.route('**/functions/v1/customer-love-photos', async route => {
    const { id } = route.request().postDataJSON();
    const entry = entries.find(item => item.id === id);
    for (const key of [...r2Objects.keys()].filter(key => key.includes(id))) r2Objects.delete(key);
    if (entry?.published && entry.consent_confirmed && photos.has(id)) {
      const key = `customer-reviews/${id}-0123456789abcdef.webp`;
      r2Objects.set(key, photos.get(id)!);
      entry.image_url = `https://images.luviacreations.com/${key}`;
    } else if (entry) entry.image_url = null;
    await route.fulfill({ json: { results: [] } });
  });
  await page.route('**/rest/v1/rpc/customer_love_photo', async route => {
    await route.fulfill({ json: photos.get(route.request().postDataJSON().testimonial_id) ?? null });
  });
  await page.route('https://images.luviacreations.com/customer-reviews/**', async route => {
    const image = r2Objects.get(new URL(route.request().url()).pathname.slice(1));
    if (image) await route.fulfill({ body: Buffer.from(image, 'base64'), contentType: 'image/webp' });
    else await route.fulfill({ status: 404 });
  });
  await page.goto('./#admin');
  await page.getByLabel('Email', { exact: true }).fill('admin@luvia.test');
  await page.getByLabel('Password', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Customer Love', exact: true }).click();
  await page.getByRole('button', { name: 'Add testimonial', exact: true }).click();
  await page.getByLabel('Customer display name').fill('Synthetic customer');
  await page.getByLabel('Customer quote').fill('A thoughtful handmade gift that makes me smile.');
  await page.getByRole('group', { name: 'Related products', exact: true }).getByLabel(catalogue.products[0].name, { exact: true }).check();
  await page.getByRole('group', { name: 'Related products', exact: true }).getByLabel(catalogue.products[1].name, { exact: true }).check();
  const photo = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#f3cf74' } })
    .jpeg().withMetadata({ exif: { IFD0: { Artist: 'Synthetic private metadata' } } }).toBuffer();
  await page.getByLabel('Customer photo (optional)').setInputFiles({ name: 'synthetic-photo.jpg', mimeType: 'image/jpeg', buffer: photo });
  await page.route('**/functions/v1/analyze-product', async route => {
    const body = route.request().postDataJSON();
    expect(body.mode).toBe('testimonial-photo-description');
    expect(body.mimeType).toBe('image/webp');
    expect(body.imageBase64).toBeTruthy();
    await route.fulfill({ json: { image_alt: 'Synthetic yellow photo used for testing' } });
  });
  await expect(page.getByRole('button', { name: 'Generate photo description with Gemini', exact: true })).toBeDisabled();
  await page.getByLabel('I have permission to send this photo to Google Gemini for a photo description.', { exact: true }).check();
  await page.getByRole('button', { name: 'Generate photo description with Gemini', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Photo description', exact: true })).toHaveValue('Synthetic yellow photo used for testing');
  await expect(page.getByRole('dialog').getByRole('blockquote')).toContainText('A thoughtful handmade gift');
  await page.getByRole('button', { name: 'Save testimonial', exact: true }).click();
  await expect(page.getByText('Testimonial saved as a private draft.')).toBeVisible();
  expect((await sharp(Buffer.from([...photos.values()][0], 'base64')).metadata()).exif).toBeUndefined();
  await page.goto('./customer-love/');
  await expect(page.getByRole('heading', { name: 'Customer Love', exact: true })).toBeVisible();
  await expect(page.getByText('Synthetic customer', { exact: true })).toHaveCount(0);
  await page.goto('./#admin');
  await page.getByRole('button', { name: 'Customer Love', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Synthetic customer', exact: true }).click();
  await page.getByLabel('Visibility').selectOption('published');
  await page.getByRole('button', { name: 'Save testimonial', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Record permission');
  await page.getByLabel(/Customer explicitly permitted/).check();
  await page.getByLabel('Permission date').fill('2026-01-01');
  await page.getByLabel('Permission source (private)').fill('Synthetic permission for testing');
  await page.getByLabel('Feature on homepage').check();
  await page.getByRole('button', { name: 'Save testimonial', exact: true }).click();
  await expect(page.getByText('Testimonial published.')).toBeVisible();
  await page.goto('./customer-love/');
  await expect(page.getByText('Synthetic customer', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: `Shop ${catalogue.products[0].name}`, exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: `Shop ${catalogue.products[1].name}`, exact: true })).toBeVisible();
  await expect(page.getByAltText('Synthetic yellow photo used for testing')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('link', { name: `Shop ${catalogue.products[0].name}`, exact: true }).click();
  await expect(page.getByRole('heading', { name: catalogue.products[0].name, level: 1 })).toBeVisible();
  await expect(page.getByText('Synthetic customer', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: `Shop ${catalogue.products[1].name}`, exact: true }).click();
  await expect(page.getByRole('heading', { name: catalogue.products[1].name, level: 1 })).toBeVisible();
  await expect(page.getByText('Synthetic customer', { exact: true })).toBeVisible();
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Loved by You' })).toBeVisible();
  await page.goto('./#admin');
  await page.getByRole('button', { name: 'Customer Love', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Synthetic customer', exact: true }).click();
  await page.getByLabel(/Customer explicitly permitted/).uncheck();
  await expect(page.getByLabel('Visibility')).toHaveValue('draft');
  await page.getByRole('button', { name: 'Save testimonial', exact: true }).click();
  await expect(page.getByText('Testimonial saved as a private draft.')).toBeVisible();
  await page.goto('./customer-love/');
  await expect(page.getByText('Synthetic customer', { exact: true })).toHaveCount(0);
  expect(r2Objects.size).toBe(0);
});
