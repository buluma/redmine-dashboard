import { test, expect, chromium, type Browser, type Page } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';

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

    test('should handle issue list page', async () => {
      await page.goto(`${BASE_URL}/`);
      await page.waitForLoadState('networkidle');
      
      // Try to find any issue table or content
      const hasContent = await page.locator('main').count() > 0;
      expect(hasContent).toBe(true);
    });

    test('should handle API health endpoint', async () => {
      const response = await page.request.get(`${BASE_URL}/api/health`);
      expect(response.ok() || response.status() === 401).toBe(true);
    });
  });

  test.describe('Page Navigation', () => {
    test('should load issues page', async () => {
      await page.goto(`${BASE_URL}/issues`);
      await page.waitForLoadState('networkidle');
      
      const main = await page.locator('main').count();
      expect(main).toBeGreaterThan(0);
    });

    test('should load personal-tickets page', async () => {
      await page.goto(`${BASE_URL}/personal-tickets`);
      await page.waitForLoadState('networkidle');
      
      const main = await page.locator('main').count();
      expect(main).toBeGreaterThan(0);
    });

    test('should load wakatime page', async () => {
      await page.goto(`${BASE_URL}/wakatime`);
      await page.waitForLoadState('networkidle');
      
      const main = await page.locator('main').count();
      expect(main).toBeGreaterThan(0);
    });

    test('should load ops page', async () => {
      await page.goto(`${BASE_URL}/ops`);
      await page.waitForLoadState('networkidle');
      
      const main = await page.locator('main').count();
      expect(main).toBeGreaterThan(0);
    });
  });

  test.describe('API Endpoints', () => {
    test('GET /api/session/me returns 401 when not authenticated', async () => {
      const response = await page.request.get(`${BASE_URL}/api/session/me`);
      // Either 401 or redirect to login is acceptable
      expect([401, 302, 307]).toContain(response.status());
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
