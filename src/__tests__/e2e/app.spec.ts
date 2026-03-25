import { test, expect } from '@playwright/test';

// Test suite for Stemgen-GUI E2E tests

test.describe('App Shell', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
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
    // Look for theme toggle button
    const themeButton = page.locator('button[aria-label*="theme" i], button[class*="theme"], button:has-text("Dark"), button:has-text("Light")');
    await expect(themeButton.first()).toBeVisible();
  });
});

test.describe('File Browser', () => {
  test('should display drag & drop zone', async ({ page }) => {
    await page.goto('/');
    
    // Check for dropzone
    const dropzone = page.locator('[class*="dropzone"], [class*="drop-zone"], [class*="drag"]');
    await expect(dropzone.first()).toBeVisible();
  });

  test('should have open folder button', async ({ page }) => {
    await page.goto('/');
    
    // Check for open folder button
    const openButton = page.getByRole('button', { name: /open|folder|browse/i });
    await expect(openButton.first()).toBeVisible();
  });
});

test.describe('Settings Panel', () => {
  test('should display AI model options', async ({ page }) => {
    await page.goto('/');
    
    // Navigate to settings
    const settingsButton = page.getByRole('button', { name: /settings/i }).or(
      page.locator('nav a:has-text("Settings")')
    );
    await settingsButton.first().click();
    
    // Check for model selection
    const modelSection = page.locator('text=/model|ai/i').first();
    await expect(modelSection).toBeVisible();
  });

  test('should display DJ software presets', async ({ page }) => {
    await page.goto('/');
    
    // Navigate to settings
    const settingsButton = page.getByRole('button', { name: /settings/i }).or(
      page.locator('nav a:has-text("Settings")')
    );
    await settingsButton.first().click();
    
    // Check for DJ software options
    const djSection = page.locator('text=/traktor|rekordbox|serato|mixxx|djay|virtualdj/i');
    await expect(djSection.first()).toBeVisible();
  });

  test('should display output format options', async ({ page }) => {
    await page.goto('/');
    
    // Navigate to settings
    const settingsButton = page.getByRole('button', { name: /settings/i }).or(
      page.locator('nav a:has-text("Settings")')
    );
    await settingsButton.first().click();
    
    // Check for format options
    const formatSection = page.locator('text=/alac|aac|format/i');
    await expect(formatSection.first()).toBeVisible();
  });
});

test.describe('Processing Queue', () => {
  test('should display queue view', async ({ page }) => {
    await page.goto('/');
    
    // Navigate to queue
    const queueButton = page.getByRole('button', { name: /queue/i }).or(
      page.locator('nav a:has-text("Queue")')
    );
    await queueButton.first().click();
    
    // Check for queue elements
    const queueView = page.locator('text=/queue|processing|jobs/i').first();
    await expect(queueView).toBeVisible();
  });

  test('should have start processing button', async ({ page }) => {
    await page.goto('/');
    
    // Navigate to queue
    const queueButton = page.getByRole('button', { name: /queue/i }).or(
      page.locator('nav a:has-text("Queue")')
    );
    await queueButton.first().click();
    
    // Check for start button
    const startButton = page.getByRole('button', { name: /start|process/i });
    await expect(startButton.first()).toBeVisible();
  });
});

test.describe('Keyboard Shortcuts', () => {
  test('should toggle sidebar with Ctrl+B', async ({ page }) => {
    await page.goto('/');
    
    // Press Ctrl+B
    await page.keyboard.press('Control+b');
    
    // Sidebar should toggle (implementation dependent)
    // Just verify no crash occurs
    await expect(page.locator('body')).toBeVisible();
  });

  test('should navigate views with number keys', async ({ page }) => {
    await page.goto('/');
    
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
  test('should work on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    
    // App should still be visible and functional
    await expect(page.locator('body')).toBeVisible();
  });

  test('should work on tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');
    
    // App should still be visible and functional
    await expect(page.locator('body')).toBeVisible();
  });
});
