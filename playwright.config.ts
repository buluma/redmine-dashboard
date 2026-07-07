import { defineConfig, devices } from '@playwright/test';

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
      // e2e/external-api.spec.ts authenticates with this key; keep the spec's
      // fallback in sync. A real EXTERNAL_API_KEYS in the environment wins.
      EXTERNAL_API_KEYS:
        process.env.EXTERNAL_API_KEYS ||
        process.env.E2E_EXTERNAL_API_KEY ||
        'e2e-test-key',
    },
  },
});
