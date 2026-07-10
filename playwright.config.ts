import { defineConfig, devices } from '@playwright/test';

// Single source of truth for the external-API key used by
// e2e/external-api.spec.ts. This file loads in the runner's main process
// before workers fork, so setting the env here reaches both the spec
// (process inheritance) and the webServer (env block below). A real
// EXTERNAL_API_KEYS in the environment wins; the spec then uses its first key.
const externalApiKeys =
  process.env.EXTERNAL_API_KEYS || process.env.E2E_EXTERNAL_API_KEY || 'e2e-test-key';
process.env.E2E_EXTERNAL_API_KEY =
  process.env.E2E_EXTERNAL_API_KEY || externalApiKeys.split(',')[0];

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    env: {
      ...(process.env as Record<string, string>),
      EXTERNAL_API_KEYS: externalApiKeys,
    },
  },
});
