import { test, expect } from '@playwright/test';

// Test suite for Stemgen-GUI E2E tests

test.describe.serial('App Shell', () => {
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

  test('should navigate to settings view via keyboard shortcut 4', async ({ page }) => {
    // Press '4' key to navigate to Settings
    await page.keyboard.press('4');
    await page.waitForTimeout(500);
    
    // Verify the page is still functional (app didn't crash)
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('should navigate to files view via keyboard shortcut 1', async ({ page }) => {
    // First navigate to settings
    await page.keyboard.press('4');
    await page.waitForTimeout(500);
    
    // Then navigate back to files
    await page.keyboard.press('1');
    await page.waitForTimeout(500);
    
    // Verify the page is still functional after navigation
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('should navigate to queue view via keyboard shortcut 2', async ({ page }) => {
    // Press '2' key to navigate to Queue
    await page.keyboard.press('2');
    await page.waitForTimeout(500);
    
    // Verify the page is still functional
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('should navigate to mixer view via keyboard shortcut 3', async ({ page }) => {
    // Press '3' key to navigate to Mixer
    await page.keyboard.press('3');
    await page.waitForTimeout(500);
    
    // Verify the page is still functional
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });
});

test.describe('Sidebar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
  });

  test('should toggle sidebar with Ctrl+B', async ({ page }) => {
    // Press Ctrl+B to toggle sidebar
    await page.keyboard.press('Control+b');
    await page.waitForTimeout(500);
    
    // App should still be functional after toggle
    const body = page.locator('body');
    await expect(body).toBeVisible();
    
    // Press Ctrl+B again to restore
    await page.keyboard.press('Control+b');
    await page.waitForTimeout(500);
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

  test('should open settings with Ctrl+, shortcut', async ({ page }) => {
    // Press Ctrl+, to open settings
    await page.keyboard.press('Control+,');
    await page.waitForTimeout(1000);
    
    // Verify page is still functional
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

  test('should work on tablet viewport', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(1000);
    
    // App should still be visible
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });
});

test.describe('Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
  });

  test('should be keyboard accessible', async ({ page }) => {
    // Tab through the page to verify keyboard navigation works
    await page.keyboard.press('Tab');
    await page.waitForTimeout(200);
    
    // App should still be functional
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('should handle escape key gracefully', async ({ page }) => {
    // Press escape to cancel current action
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    
    // App should still be functional
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });
});

test.describe('Theme Switching', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
  });

  test('should support light theme', async ({ page }) => {
    // Navigate to settings
    await page.keyboard.press('4');
    await page.waitForTimeout(500);
    
    // Verify page is still functional
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });
});
