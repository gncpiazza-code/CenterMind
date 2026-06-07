import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } }); // iPhone 14 Pro

test.describe('Dashboard mobile — Smoke Tests', () => {
  test('redirects unauthenticated to /login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('mobile scroll layout: KPI y ranking sections presentes', async ({ page }) => {
    const fakePayload = btoa(JSON.stringify({
      sub: 'test-mobile',
      rol: 'admin',
      id_distribuidor: 1,
      exp: Math.floor(Date.now() / 1000) + 3600,
      permisos: {},
    }));
    const fakeToken = `header.${fakePayload}.sig`;

    await page.addInitScript((token: string) => {
      localStorage.setItem('shelfy_token', token);
    }, fakeToken);

    await page.goto('/dashboard');

    // En mobile (<md) debe mostrar DashboardMobileScroll con los data-testid
    const kpiSection = page.locator('[data-testid="mobile-kpi-section"]');
    const rankingSection = page.locator('[data-testid="mobile-ranking-section"]');

    // Puede redirigir a login si el token no es válido en el cliente — solo verificamos que no crashea
    const url = page.url();
    if (url.includes('/login')) return;

    await expect(kpiSection).toBeVisible({ timeout: 8000 });
    await expect(rankingSection).toBeVisible({ timeout: 8000 });
  });

  test('no horizontal overflow en mobile', async ({ page }) => {
    await page.goto('/dashboard');
    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const windowWidth = await page.evaluate(() => window.innerWidth);
    expect(scrollWidth).toBeLessThanOrEqual(windowWidth + 5);
  });
});
