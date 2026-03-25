// Helper functions for E2E tests

import type { Page, Locator } from '@playwright/test';

/**
 * Wait for element to be visible with timeout
 */
export async function waitForVisible(
  page: Page,
  selector: string,
  timeout: number = 5000
): Promise<Locator> {
  const locator = page.locator(selector);
  await locator.waitFor({ state: 'visible', timeout });
  return locator;
}

/**
 * Click and wait for navigation
 */
export async function clickAndWaitForNavigation(
  page: Page,
  selector: string
): Promise<void> {
  await Promise.all([
    page.waitForNavigation(),
    page.locator(selector).click(),
  ]);
}

/**
 * Fill form input
 */
export async function fillInput(
  page: Page,
  selector: string,
  value: string
): Promise<void> {
  await page.locator(selector).fill(value);
}

/**
 * Select dropdown option
 */
export async function selectDropdownOption(
  page: Page,
  dropdownSelector: string,
  optionText: string
): Promise<void> {
  await page.locator(dropdownSelector).click();
  await page.getByRole('option', { name: optionText }).click();
}

/**
 * Check if element exists
 */
export async function elementExists(
  page: Page,
  selector: string
): Promise<boolean> {
  const count = await page.locator(selector).count();
  return count > 0;
}

/**
 * Get all text content from a list
 */
export async function getListItems(
  page: Page,
  listSelector: string
): Promise<(string | null)[]> {
  const items = await page.locator(listSelector).all();
  return Promise.all(items.map(item => item.textContent()));
}

/**
 * Take screenshot with custom name
 */
export async function takeScreenshot(
  page: Page,
  name: string
): Promise<void> {
  await page.screenshot({ path: `screenshots/${name}.png`, fullPage: true });
}

/**
 * Drag and drop helper
 */
export async function dragAndDrop(
  page: Page,
  sourceSelector: string,
  targetSelector: string
): Promise<void> {
  const source = page.locator(sourceSelector);
  const target = page.locator(targetSelector);
  
  await source.dragTo(target);
}

/**
 * Wait for network idle
 */
export async function waitForNetworkIdle(
  page: Page,
  timeout: number = 30000
): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout });
}

/**
 * Clear all cookies and local storage
 */
export async function clearBrowserData(page: Page): Promise<void> {
  await page.context().clearCookies();
  await page.evaluate(() => localStorage.clear());
}
