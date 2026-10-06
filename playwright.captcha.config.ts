import config from './playwright.config';

export default {
  ...config,
  testIgnore: [],
  testMatch: '**/cart-captcha.spec.ts',
  use: { ...config.use, baseURL: 'http://127.0.0.1:4194/' },
  webServer: {
    ...config.webServer,
    command: 'npm run dev -- --host 127.0.0.1 --port 4194 --strictPort',
    url: 'http://127.0.0.1:4194/',
    env: { ...config.webServer.env, VITE_TURNSTILE_SITE_KEY: 'test-site-key' },
  },
};
