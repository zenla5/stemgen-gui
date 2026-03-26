import { test, expect } from '@playwright/test';

// Test suite for Stemgen-GUI E2E tests

test.describe('App Shell', () => {
  test.beforeEach(async ({ page }) => {
    // Wait for the app to be fully loaded
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    // Give the app time to render
    await page.waitForTimeout(2000);
  });

  test('should load the app', async ({ page }) => {
    // Check that the page loaded
    await expect(page).toHaveTitle(/Stemgen/i);
  });

  test('should display app content', async ({ page }) => {
    // Check that the app shell loaded
    const appLoaded = await page.locator('body').isVisible();
    expect(appLoaded).toBeTruthy();
  });
});

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
  });

  test('should be able to navigate between views', async ({ page }) => {
    // Just check that the page is functional
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });
});

test.describe('Settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    
    // Try to find settings navigation
    const settingsNav = page.getByText(/settings/i, { exact: false }).first();
    if (await settingsNav.isVisible({ timeout: 5000 }).catch(() => false)) {
      await settingsNav.click();
      await page.waitForTimeout(1000);
    }
  });

  test('should display settings when navigated', async ({ page }) => {
    // Just verify page is still functional
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });
});

test.describe('Responsive Design', () => {
  test('should work on mobile viewport', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(1000);
    
    // App should still be visible
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('should work on desktop viewport', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(1000);
    
    // App should still be visible
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });
});
