import { expect, test } from '@playwright/test';
import { installMockSupabase } from './mockSupabase';

test('founder portrait loads in the homepage introduction and full About story', async ({ page }) => {
  await installMockSupabase(page);
  for (const path of ['/', '/about/']) {
    await page.goto(path);
    const portrait = page.getByRole('img', { name: 'Tanushree Mithal, founder of Luvia Creations', exact: true });
    await expect(portrait).toBeVisible();
    await expect.poll(() => portrait.evaluate(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0)).toBe(true);
    await expect(portrait).toHaveAttribute('src', path === '/' ? '/tanushree-mithal-small.webp' : '/tanushree-mithal.webp');
    await expect(portrait).toHaveAttribute('draggable', 'false');
    expect(await portrait.evaluate(image => {
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      image.dispatchEvent(event);
      return event.defaultPrevented;
    })).toBe(true);
    expect(await portrait.evaluate(image => getComputedStyle(image).userSelect)).toBe('none');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width);
  }
});

test('FAQ explains AI imagery and offers actual product photo clarification', async ({ page }) => {
  await installMockSupabase(page);
  await page.goto('/faq/');
  const question = page.getByText('Are your product images generated using AI?', { exact: true });
  await question.click();
  await expect(page.getByText(/Some lifestyle and styled images/)).toBeVisible();
  await expect(page.getByText(/Some lifestyle and styled images/)).toContainText('actual product photograph');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});

test('footer displays Gurugram and payment network logos without mobile overflow', async ({ page }) => {
  await installMockSupabase(page);
  await page.goto('/');
  const footer = page.getByRole('contentinfo');
  await footer.scrollIntoViewIfNeeded();
  if (page.viewportSize()!.width < 768) {
    await expect(footer.getByText('Gurugram, Haryana, India', { exact: true })).toBeHidden();
  } else {
    await expect(footer.getByText('Gurugram, Haryana, India', { exact: true })).toBeVisible();
  }
  const payments = footer.getByRole('region', { name: 'Payment methods' });
  for (const name of ['UPI', 'Visa', 'Mastercard', 'RuPay']) {
    const image = payments.getByRole('img', { name, exact: true });
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate(node => {
      const element = node as HTMLImageElement;
      return element.complete && element.naturalWidth > 0;
    })).toBe(true);
  }
  await expect(payments).toContainText('Available payment methods are shown at checkout.');
  if (page.viewportSize()!.width >= 768) await expect(payments.getByText('Wallet', { exact: true })).toBeVisible();
  else {
    await expect(payments.getByText('Wallet', { exact: true })).toBeHidden();
    const logos = await payments.getByRole('img').all();
    const boxes = await Promise.all(logos.map(logo => logo.boundingBox()));
    expect(new Set(boxes.map(box => Math.round(box!.y + box!.height / 2))).size).toBe(1);
    await page.setViewportSize({ width: 320, height: 640 });
    expect((await footer.boundingBox())!.height).toBeLessThan(320);
  }
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('hamburger menu reaches collaboration contact on home and information pages', async ({ page }) => {
  await installMockSupabase(page);
  for (const path of ['/', '/about/']) {
    await page.goto(path);
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await page.getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Collaborate with us' }).click();
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toHaveCount(0);
    const section = page.getByRole('region', { name: 'Create with Luvia' });
    await expect(section).toBeInViewport();
    await expect(section).toContainText('not an announcement of open jobs');
    for (const name of ['Makers', 'Creators', 'Partners']) {
      await expect(section.getByRole('heading', { name, exact: true })).toBeVisible();
    }
    await expect(page.getByRole('link', { name: 'Work with Luvia', includeHidden: true })).toHaveAttribute('href', '#collaborate');
    const link = section.getByRole('link', { name: 'Introduce yourself' });
    const url = new URL(await link.getAttribute('href') ?? '');
    expect(url.origin).toBe('https://wa.me');
    expect(url.searchParams.get('text')).toContain('maker, content creator or partner');
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  }
});

test('store pages reflect added, renamed and removed admin categories without hardcoded links', async ({ page }) => {
  const state = await installMockSupabase(page);
  await page.goto('/collections/');
  const collections = page.getByRole('navigation', { name: 'Explore collections' });
  await expect(collections.getByRole('link', { name: 'Charms', exact: true })).toBeVisible();
  state.categories.push('Gift Sets');
  state.categorySettings['Gift Sets'] = { priority: 1 };
  await expect(page.getByRole('button', { name: 'Refresh catalogue' })).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForLoadState('networkidle');
  await expect(collections.getByRole('link', { name: 'Gift Sets', exact: true })).toHaveCount(0);
  state.products[0].category = 'Gift Sets';
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(collections.getByRole('link', { name: 'Gift Sets', exact: true })).toHaveAttribute('href', '/collections/gift-sets/');
  await collections.getByRole('link', { name: 'Gift Sets', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Handmade Gift Sets', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Rose Charm', exact: true })).toBeVisible();
  state.categories = state.categories.map(category => category === 'Gift Sets' ? 'Gift Bundles' : category);
  delete state.categorySettings['Gift Sets'];
  state.categorySettings['Gift Bundles'] = { priority: 1 };
  state.products[0].category = 'Gift Bundles';
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('alert')).toContainText('no longer available');
  await page.getByRole('navigation', { name: 'Explore collections' }).getByRole('link', { name: 'Gift Bundles', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Handmade Gift Bundles', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Rose Charm', exact: true })).toBeVisible();
  state.categories = state.categories.filter(category => category !== 'Gift Bundles');
  delete state.categorySettings['Gift Bundles'];
  state.products[0].category = 'Charms';
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
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
  await expect(page.getByRole('heading', { name: 'The Story Behind Luvia', exact: true })).toBeVisible();
  await expect(page.getByText(/does not take payment or confirm an order/)).toBeVisible();
  await expect(page.getByText(/Prices are in Indian rupees/)).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Explore collections' }).getByRole('link', { name: 'Charms', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Read the ordering FAQ', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ordering, delivery & care FAQ', exact: true })).toBeVisible();
  await page.getByText('How do I place an order?', { exact: true }).click();
  await expect(page.getByText(/Adding items or sending a message does not confirm an order/)).toBeVisible();
  await expect(page.getByText('Does this website take payment or complete checkout?', { exact: true })).toHaveCount(0);
  await page.getByText('Are shipping charges included in the displayed price?', { exact: true }).click();
  await expect(page.getByText(/Any shipping charge is shown in your checkout total before payment/)).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

test('mobile About page aligns policy links and evenly sizes collection buttons', async ({ page }) => {
  const state = await installMockSupabase(page);
  state.products[0].category = 'Charms & Keychains';
  state.categories.push('Charms & Keychains');
  state.categorySettings['Charms & Keychains'] = { priority: 1 };
  for (const width of [320, 360, 414]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/about/');
    const policies = page.getByRole('navigation', { name: 'Ordering policies' });
    const faq = await policies.getByRole('link', { name: 'Read the ordering FAQ' }).boundingBox();
    const returns = await policies.getByRole('link', { name: 'Return and refund policy' }).boundingBox();
    expect(faq).not.toBeNull();
    expect(returns).not.toBeNull();
    expect(Math.abs(faq!.x - returns!.x)).toBeLessThan(1);
    expect(returns!.y).toBeGreaterThanOrEqual(faq!.y + faq!.height);
    expect(faq!.height).toBeGreaterThanOrEqual(44);
    expect(returns!.height).toBeGreaterThanOrEqual(44);
    const collections = page.getByRole('navigation', { name: 'Explore collections' });
    const boxes = await collections.getByRole('link').evaluateAll(links =>
      links.map(link => { const box = link.getBoundingClientRect(); return { width: box.width, height: box.height }; }));
    expect(boxes.length).toBeGreaterThan(1);
    expect(Math.max(...boxes.map(box => box.width)) - Math.min(...boxes.map(box => box.width))).toBeLessThan(1);
    expect(boxes.every(box => box.height >= 44)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await expect(page.getByText(/Never share your card PIN/)).toBeVisible();
  }
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

test('store headers use responsive branding and product details offer a contextual customisation enquiry', async ({ page }) => {
  await installMockSupabase(page);
  for (const path of ['/collections/', '/collections/charms/', '/bestsellers/', '/featured/', '/about/', '/faq/']) {
    await page.goto(path);
    const logo = page.getByRole('link', { name: 'Luvia Creations — home' });
    const menu = page.getByRole('button', { name: 'Open navigation' });
    const logoBox = await logo.boundingBox();
    const menuBox = await menu.boundingBox();
    expect(logoBox).not.toBeNull();
    expect(menuBox).not.toBeNull();
    if (page.viewportSize()!.width < 640) {
      expect(logoBox!.x).toBe(16);
      expect(logoBox!.width).toBe(48);
      expect(logoBox!.y + logoBox!.height).toBeLessThan(menuBox!.y);
    } else {
      expect(logoBox!.x + logoBox!.width).toBeLessThan(menuBox!.x);
      expect(logoBox!.x).toBeLessThan(150);
      expect(logoBox!.width).toBe(menuBox!.width);
      expect(Math.abs(logoBox!.y - menuBox!.y)).toBeLessThan(2);
    }
  }
  await page.goto('/collections/charms/');
  await page.getByRole('button', { name: 'View Rose Charm', exact: true }).click();
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
    expect(logoBox!.width).toBe(80);
    expect(logoBox!.y + logoBox!.height).toBeLessThan(cartBox!.y);
    await expect(page.getByRole('navigation', { name: 'Mobile navigation', exact: true })).toBeInViewport({ ratio: 1 });
  }
});

test('mobile footer is compact with complete contact links and usable tap targets', async ({ page }) => {
  await installMockSupabase(page);
  await page.goto('/faq/');
  const footer = page.getByRole('contentinfo');
  await footer.scrollIntoViewIfNeeded();
  const mobile = page.viewportSize()!.width < 768;
  if (mobile) {
    expect((await footer.boundingBox())!.height).toBeLessThan(320);
    for (const name of ['Contact us', 'Share feedback']) {
      const link = footer.getByRole('link', { name, exact: true });
      await expect(link).toBeVisible();
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    const toggle = footer.getByRole('button', { name: 'Help & information' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect((await toggle.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  }
  for (const name of ['Explore collections', 'About & contact', 'Ordering FAQ', 'Return and refund policy',
    'Contact on WhatsApp', 'Contact on Instagram', 'orders@luviacreations.com', 'hello@luviacreations.com']) {
    const link = footer.getByRole('link', { name, exact: true });
    await expect(link).toBeVisible();
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  if (mobile) {
    const whatsapp = await footer.getByRole('link', { name: 'Contact on WhatsApp' }).boundingBox();
    const instagram = await footer.getByRole('link', { name: 'Contact on Instagram' }).boundingBox();
    expect(whatsapp!.y).toBe(instagram!.y);
    await footer.getByRole('button', { name: 'Help & information' }).click();
    await expect(footer.getByRole('link', { name: 'Return and refund policy' })).toHaveCount(0);
    expect((await footer.boundingBox())!.height).toBeLessThan(320);
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(footer.getByRole('link', { name: 'Return and refund policy' })).toBeVisible();
    await expect(footer.getByRole('region', { name: 'Payment methods' })).toBeVisible();
    await expect(footer.getByRole('button', { name: 'Help & information' })).toBeHidden();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});
