import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } }); // iPhone 14 Pro

test.describe('Visor mobile — Smoke Tests', () => {
  test('redirects unauthenticated to /login', async ({ page }) => {
    await page.goto('/visor');
    await expect(page).toHaveURL(/\/login/);
  });

  test('no horizontal overflow en mobile', async ({ page }) => {
    await page.goto('/visor');
    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const windowWidth = await page.evaluate(() => window.innerWidth);
    expect(scrollWidth).toBeLessThanOrEqual(windowWidth + 5);
  });

  test('demo mode: page renders sin crash', async ({ page }) => {
    // /visor/demo es ruta pública — no necesita auth
    await page.goto('/visor/demo');
    const body = page.locator('body');
    await expect(body).not.toBeEmpty();
  });
});
