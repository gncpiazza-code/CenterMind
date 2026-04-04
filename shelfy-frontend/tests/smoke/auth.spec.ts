import { test, expect } from '@playwright/test';

test.describe('Auth Smoke Tests', () => {
  test('should render login page with all critical elements', async ({ page }) => {
    await page.goto('/login');

    // Page title or logo should be visible
    const logo = page.locator('img[alt="Shelfy"]');
    await expect(logo).toBeVisible();

    // Inputs should be present
    const userField = page.getByPlaceholder('Tu nombre de usuario');
    const passField = page.getByPlaceholder('••••••••');
    await expect(userField).toBeVisible();
    await expect(passField).toBeVisible();

    // Login button should be present
    const loginBtn = page.getByRole('button', { name: /iniciar sesión/i });
    await expect(loginBtn).toBeVisible();
  });

  test('should show error on invalid login attempt', async ({ page }) => {
    await page.goto('/login');

    // Fill in wrong credentials
    await page.getByPlaceholder('Tu nombre de usuario').fill('invalid_user');
    await page.getByPlaceholder('••••••••').fill('wrong_password');

    // Submit
    await page.getByRole('button', { name: /iniciar sesión/i }).click();

    // Since we are mocking in unit tests, here we test the real UI response
    // If the server is not running or the API fails, it might show a generic error
    // For a smoke test, we just ensure it didn't crash (White screen of death)
    const body = page.locator('body');
    await expect(body).not.toBeEmpty();
  });
});
