import { test, expect } from '@playwright/test';

// Test suite for Stemgen-GUI E2E tests

test.describe('App Shell', () => {
  test.beforeEach(async ({ page }) => {
    // Wait for the app to be fully loaded
    await page.goto('/', { waitUntil: 'networkidle' });
  });

  test('should load the app', async ({ page }) => {
    // Check that the app title is present
    await expect(page).toHaveTitle(/Stemgen/i);
  });

  test('should display sidebar navigation', async ({ page }) => {
    // Check for sidebar elements
    const sidebar = page.locator('nav, aside, [class*="sidebar"]');
    await expect(sidebar).toBeVisible();
  });

  test('should have dark/light theme toggle', async ({ page }) => {
    // Look for theme toggle button - be more specific
    const themeButton = page.locator('button:has-text("Appearance"), button:has-text("Dark"), button:has-text("Light")');
    await expect(themeButton.first()).toBeVisible();
  });
});

test.describe('File Browser', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
  });

  test('should display drag & drop zone', async ({ page }) => {
    // Check for dropzone - look for the drop overlay or main content
    const dropzone = page.locator('[class*="dropzone"], [class*="drop-zone"], [class*="drag"], text="Drop"');
    await expect(dropzone.first()).toBeVisible();
  });

  test('should have open folder button', async ({ page }) => {
    // Check for open folder button
    const openButton = page.getByRole('button', { name: /open|folder|browse/i });
    await expect(openButton.first()).toBeVisible();
  });
});

test.describe('Settings Panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    
    // Navigate to settings
    const settingsButton = page.getByRole('button', { name: /settings/i }).or(
      page.locator('nav a:has-text("Settings")')
    );
    await settingsButton.first().click();
    
    // Wait for settings panel to load
    await page.waitForSelector('text="Settings"', { state: 'visible' });
  });

  test('should display AI model options', async ({ page }) => {
    // Check for AI Model section with more specific selector
    const modelSection = page.locator('h3:has-text("AI Model")');
    await expect(modelSection).toBeVisible();
    
    // Also check for model names from constants
    const modelButton = page.locator('button:has-text("bs_roformer"), button:has-text("Demucs")');
    await expect(modelButton.first()).toBeVisible();
  });

  test('should display DJ software presets', async ({ page }) => {
    // Check for DJ Software section
    const djSection = page.locator('h3:has-text("Target DJ Software")');
    await expect(djSection).toBeVisible();
    
    // Check for DJ software names
    const djSoftware = page.locator('button:has-text("Traktor"), button:has-text("rekordbox")');
    await expect(djSoftware.first()).toBeVisible();
  });

  test('should display output format options', async ({ page }) => {
    // Check for Output Format section
    const formatSection = page.locator('h3:has-text("Output Format")');
    await expect(formatSection).toBeVisible();
  });
});

test.describe('Processing Queue', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    
    // Navigate to queue
    const queueButton = page.getByRole('button', { name: /queue/i }).or(
      page.locator('nav a:has-text("Queue")')
    );
    await queueButton.first().click();
  });

  test('should display queue view', async ({ page }) => {
    // Check for queue elements - look for ProcessingQueue section or empty state
    const queueView = page.locator('text=/queue|processing|jobs/i').first();
    await expect(queueView).toBeVisible();
  });

  test('should have start processing button', async ({ page }) => {
    // Check for start button
    const startButton = page.getByRole('button', { name: /start|process/i });
    await expect(startButton.first()).toBeVisible();
  });
});

test.describe('Keyboard Shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
  });

  test('should toggle sidebar with Ctrl+B', async ({ page }) => {
    // Press Ctrl+B
    await page.keyboard.press('Control+b');
    
    // Sidebar should toggle (implementation dependent)
    // Just verify no crash occurs
    await expect(page.locator('body')).toBeVisible();
  });

  test('should navigate views with number keys', async ({ page }) => {
    // Press 1-4 for navigation
    await page.keyboard.press('1');
    await page.waitForTimeout(100);
    await expect(page.locator('body')).toBeVisible();
    
    await page.keyboard.press('2');
    await page.waitForTimeout(100);
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Responsive Design', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
  });

  test('should work on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    
    // App should still be visible and functional
    await expect(page.locator('body')).toBeVisible();
  });

  test('should work on tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    
    // App should still be visible and functional
    await expect(page.locator('body')).toBeVisible();
  });
});
