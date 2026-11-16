import { expect, test } from '@playwright/test';

test('OAuth popup returns the code even when the PWA service worker controls the site', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  const callback = page.evaluate(() => new Promise<unknown>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('Meta callback timed out')), 10_000);
    window.addEventListener('message', event => {
      if (event.origin === window.location.origin && event.data?.type === 'meta-oauth-callback') {
        window.clearTimeout(timer);
        resolve(event.data);
      }
    }, { once: true });
    window.open('/meta-oauth-callback.html?state=state-fixture&code=code-fixture', '_blank');
  }));
  await expect(callback).resolves.toMatchObject({
    type: 'meta-oauth-callback', state: 'state-fixture', code: 'code-fixture',
  });
});
