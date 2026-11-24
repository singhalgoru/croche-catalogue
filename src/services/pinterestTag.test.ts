import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const delayed = vi.hoisted(() => ({ callback: undefined as (() => void) | undefined }));
vi.mock('../utils/afterPageLoad', () => ({
  afterPageLoad: (callback: () => void) => { delayed.callback = callback; },
}));

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('VITE_PINTEREST_TAG_ID', '123456789');
  history.replaceState(null, '', '/');
  localStorage.clear();
  delayed.callback = undefined;
  delete window.pintrk;
});
afterEach(() => {
  document.querySelectorAll('script[src="https://s.pinimg.com/ct/core.js"]').forEach(script => script.remove());
  delete window.pintrk;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it('loads the configured tag and queues a page view once per invocation', async () => {
  const { trackPinterestPage } = await import('./pinterestTag');
  trackPinterestPage();
  trackPinterestPage();
  expect(window.pintrk?.queue).toEqual([['load', '123456789'], ['page'], ['page']]);
  delayed.callback?.();
  expect(document.querySelectorAll('script[src="https://s.pinimg.com/ct/core.js"]')).toHaveLength(1);
});

it('does not load for unconfigured, private, internal or sensitive routes', async () => {
  const { trackPinterestPage } = await import('./pinterestTag');
  vi.stubEnv('VITE_PINTEREST_TAG_ID', '');
  trackPinterestPage();
  vi.stubEnv('VITE_PINTEREST_TAG_ID', '123456789');
  for (const url of ['/#admin', '/artisans/', '/?token_hash=secret', '/#access_token=secret']) {
    history.replaceState(null, '', url);
    trackPinterestPage();
    expect(window.pintrk).toBeUndefined();
  }
  history.replaceState(null, '', '/');
  localStorage.setItem('luvia:internal-traffic', 'true');
  trackPinterestPage();
  expect(window.pintrk).toBeUndefined();
});

it('does not load a queued tag after navigating to a private route', async () => {
  const { trackPinterestPage } = await import('./pinterestTag');
  trackPinterestPage();
  history.replaceState(null, '', '/#admin');
  delayed.callback?.();
  expect(window.pintrk).toBeUndefined();
  expect(document.querySelector('script[src="https://s.pinimg.com/ct/core.js"]')).toBeNull();
});
