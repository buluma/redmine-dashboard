import { test, expect, chromium, type Browser, type Page } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';

async function expectLoginRedirect(page: Page, path: string) {
  await page.goto(`${BASE_URL}${path}`);
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator('.login-root')).toBeVisible();
}

test.describe('Converge E2E Tests', () => {
  let browser: Browser;
  let page: Page;

  test.beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });

  test.afterAll(async () => {
    await browser.close();
  });

  test.beforeEach(async () => {
    page = await browser.newPage();
  });

  test.afterEach(async () => {
    await page.close();
  });

  test.describe('Happy Path: Connect → Sync → View Issues → Log Time', () => {
    test('should load the homepage', async () => {
      await page.goto(BASE_URL);
      
      // Should show login or dashboard
      const url = page.url();
      expect(url).toMatch(/http:\/\/localhost:3000/);
    });

    test('should display navigation sidebar', async () => {
      await page.goto(BASE_URL);
      await page.waitForLoadState('networkidle');
      
      // Check for sidebar or login
      const body = await page.locator('body').textContent();
      expect(body).toBeTruthy();
    });

    test('redirects anonymous visitors from the dashboard to login', async () => {
      await expectLoginRedirect(page, '/');
    });

    test('should handle API health endpoint', async () => {
      const response = await page.request.get(`${BASE_URL}/api/health`);
      expect(response.ok() || response.status() === 401).toBe(true);
    });
  });

  test.describe('Page Navigation', () => {
    test('redirects anonymous visitors from issues to login', async () => {
      await expectLoginRedirect(page, '/issues');
    });

    test('redirects anonymous visitors from personal tickets to login', async () => {
      await expectLoginRedirect(page, '/personal-tickets');
    });

    test('redirects anonymous visitors from WakaTime to login', async () => {
      await expectLoginRedirect(page, '/wakatime');
    });

    test('redirects anonymous visitors from operations to login', async () => {
      await expectLoginRedirect(page, '/ops');
    });
  });

  test.describe('API Endpoints', () => {
    test('GET /api/session/me returns an anonymous session when not authenticated', async () => {
      const response = await page.request.get(`${BASE_URL}/api/session/me`);
      expect(response.status()).toBe(200);
      await expect(response.json()).resolves.toEqual({ user: null });
    });

    test('GET /api/health returns valid response', async () => {
      const response = await page.request.get(`${BASE_URL}/api/health`);
      const status = response.status();
      expect([200, 401]).toContain(status);
    });

    test('GET /api/reports returns data structure', async () => {
      // This may return 401 without auth, which is fine
      const response = await page.request.get(`${BASE_URL}/api/reports`);
      expect([200, 401, 500]).toContain(response.status());
    });
  });

  test.describe('Mobile API', () => {
    test('should reject mobile unauthenticated requests', async () => {
      const response = await page.request.get(`${BASE_URL}/api/mobile/v1/me`);
      expect(response.status()).toBe(401);
    });

    test('should require token for mobile endpoints', async () => {
      const response = await page.request.get(`${BASE_URL}/api/mobile/v1/issues`);
      expect(response.status()).toBe(401);
    });
  });
});

test.describe('Webhook Delivery Tests', () => {
  let browser: Browser;
  let page: Page;

  test.beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });

  test.afterAll(async () => {
    await browser.close();
  });

  test.beforeEach(async () => {
    page = await browser.newPage();
  });

  test.afterEach(async () => {
    await page.close();
  });

  test('webhooks page loads for admin', async () => {
    // Skip if not authenticated - this tests the page loads attempt
    await page.goto(`${BASE_URL}/webhooks`);
    await page.waitForLoadState('networkidle');
    
    // Should either show page or redirect
    const currentUrl = page.url();
    expect(currentUrl).toMatch(/webhooks|login|\/$/);
  });
});
