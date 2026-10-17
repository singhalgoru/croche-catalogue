import { defineConfig, devices } from '@playwright/test';

// Read-only checks against the deployed site, run after every deployment.
export default defineConfig({
  testDir: './e2e-smoke',
  fullyParallel: true,
  workers: 2,
  retries: 2,
  timeout: 60_000,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: process.env.SMOKE_BASE_URL ?? 'https://luviacreations.com/',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
