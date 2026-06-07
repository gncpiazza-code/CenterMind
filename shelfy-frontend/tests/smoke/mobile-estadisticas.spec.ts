import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } }); // iPhone 14 Pro

test.describe('Estadísticas mobile — Smoke Tests', () => {
  test('redirects unauthenticated to /login', async ({ page }) => {
    await page.goto('/estadisticas');
    await expect(page).toHaveURL(/\/login/);
  });

  test('no horizontal overflow en mobile', async ({ page }) => {
    await page.goto('/estadisticas');
    // Puede redirigir a login — en cualquier caso no debe haber overflow horizontal
    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const windowWidth = await page.evaluate(() => window.innerWidth);
    expect(scrollWidth).toBeLessThanOrEqual(windowWidth + 5);
  });

  test('page renders sin crash en mobile con auth inyectada', async ({ page }) => {
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

    await page.goto('/estadisticas');

    // Body must not be empty
    const bodyContent = await page.locator('body').textContent();
    expect(bodyContent).not.toBeNull();
    expect(bodyContent!.length).toBeGreaterThan(0);
  });
});
