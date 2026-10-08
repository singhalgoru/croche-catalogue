import { expect, test, type Page } from '@playwright/test';
import { installMockSupabase } from './mockSupabase';

async function mockChallenge(page: Page, prepareAutomatically = false) {
  await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js*', route => route.fulfill({
    contentType: 'application/javascript',
    body: `window.turnstile = {
      render(container, options) {
        if (${prepareAutomatically} && options.appearance === 'interaction-only') {
          setTimeout(() => {
            options.callback('prepared-captcha-token');
            container.dataset.prepared = 'true';
          }, 200);
          return 'prepared-widget';
        }
        container.innerHTML = '';
        const pass = document.createElement('button');
        pass.textContent = 'Pass test challenge';
        pass.onclick = () => options.callback('test-captcha-token');
        const fail = document.createElement('button');
        fail.textContent = 'Fail test challenge';
        fail.onclick = () => options['error-callback']();
        container.append(pass, fail);
        return 'test-widget';
      },
      remove() {}
    };`,
  }));
}

test('prepares a single-use token before the first add without creating a cart early', async ({ page }) => {
  const state = await installMockSupabase(page);
  await mockChallenge(page, true);
  await page.goto('/');
  await expect(page.getByLabel('Background bot verification')).toHaveCount(1);
  await expect(page.locator('[data-prepared="true"]')).toHaveCount(1);
  expect(state.carts).toHaveLength(0);
  const signup = page.waitForRequest(request => request.url().endsWith('/auth/v1/signup'));
  await page.getByRole('button', { name: 'Add to cart — Rose Charm' }).click();
  expect((await signup).postDataJSON()).toMatchObject({
    gotrue_meta_security: { captcha_token: 'prepared-captcha-token' },
  });
  await expect(page.getByRole('button', { name: 'Open cart with 1 item' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Quick bot check' })).toHaveCount(0);
});

test('CAPTCHA gates anonymous cart creation, allows retry and skips restored sessions', async ({ page }) => {
  const state = await installMockSupabase(page);
  await mockChallenge(page);
  let signupBody: Record<string, unknown> | null = null;
  page.on('request', request => {
    if (request.url().endsWith('/auth/v1/signup')) signupBody = request.postDataJSON();
  });
  await page.goto('/');
  const add = page.getByRole('button', { name: 'Add to cart — Rose Charm' });
  await add.click();
  const dialog = page.getByRole('dialog', { name: 'Quick bot check' });
  await expect(dialog).toBeVisible();
  expect(signupBody).toBeNull();
  expect(state.carts).toHaveLength(0);
  await page.getByRole('button', { name: 'Fail test challenge' }).click();
  await expect(dialog.getByRole('alert')).toContainText('failed');
  expect(signupBody).toBeNull();
  await page.getByRole('button', { name: 'Retry verification' }).click();
  await page.getByRole('button', { name: 'Pass test challenge' }).click();
  await expect(page.getByRole('button', { name: 'Open cart with 1 item' })).toBeVisible();
  expect(signupBody).toMatchObject({ gotrue_meta_security: { captcha_token: 'test-captcha-token' } });
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await add.click();
  await expect(page.getByRole('button', { name: 'Open cart with 2 items' })).toBeVisible();
  await expect(dialog).toHaveCount(0);
});

test('CAPTCHA cancellation leaves no cart and admin login also forwards verification', async ({ page }) => {
  const state = await installMockSupabase(page);
  await mockChallenge(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Add to cart — Rose Charm' }).click();
  await page.getByRole('dialog', { name: 'Quick bot check' }).getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText(/Bot verification cancelled/)).toBeVisible();
  expect(state.carts).toHaveLength(0);
  await page.goto('/#admin');
  await page.getByLabel('Email', { exact: true }).fill('admin@luvia.test');
  await page.getByLabel('Password', { exact: true }).fill('test-password');
  const tokenRequest = page.waitForRequest(request => request.url().includes('/auth/v1/token'));
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Quick bot check' })).toBeVisible();
  await page.getByRole('button', { name: 'Pass test challenge' }).click();
  expect((await tokenRequest).postDataJSON()).toMatchObject({ gotrue_meta_security: { captcha_token: 'test-captcha-token' } });
  await expect(page.getByRole('heading', { name: 'Manage catalogue' })).toBeVisible();
});
