/**
 * e2e/auth.spec.ts
 * Authentication tests: login, logout, invalid credentials.
 */
import { test, expect } from '@playwright/test';
import { loginAs, logout } from './helpers/auth';

test.describe('Authentication', () => {

  test('donor can log in and reach dashboard', async ({ page }) => {
    await loginAs(page, 'donor');
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible();
  });

  test('volunteer can log in and reach tasks', async ({ page }) => {
    await loginAs(page, 'volunteer');
    await expect(page.getByRole('navigation')).toContainText(/my tasks/i);
  });

  test('admin can log in and see admin panel link', async ({ page }) => {
    await loginAs(page, 'admin');
    await expect(page.getByRole('navigation')).toContainText(/admin/i);
  });

  test('donor can log out', async ({ page }) => {
    await loginAs(page, 'donor');
    await logout(page);
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('invalid credentials shows error', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByLabel(/email/i).fill('invalid@example.com');
    await page.getByLabel(/password/i).fill('wrongpassword');
    await page.getByRole('button', { name: /sign in|log in|login/i }).click();
    await expect(
      page.getByText(/invalid|incorrect|wrong|failed/i)
    ).toBeVisible({ timeout: 10_000 });
  });

  test('empty form shows validation errors', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByRole('button', { name: /sign in|log in|login/i }).click();
    // Either HTML5 required validation or an error message should appear
    const invalid = await page.evaluate(() =>
      document.querySelector('input[type="email"]')?.validity.valid === false
    );
    expect(invalid).toBe(true);
  });
});
