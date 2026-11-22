/**
 * e2e/auth.spec.ts
 * Authentication tests: login, logout, invalid credentials, and strict live integration.
 */
import { test, expect } from '@playwright/test';
import { loginAs, loginWithCredentialsStrict, logout } from './helpers/auth';

test.describe('Authentication', () => {

  test('donor can log in and reach dashboard', async ({ page }) => {
    await loginAs(page, 'donor');
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('heading', { name: /dashboard|welcome back/i })).toBeVisible({ timeout: 15_000 });
  });

  test('volunteer can log in and reach tasks', async ({ page }) => {
    await loginAs(page, 'volunteer');
    await expect(page.getByRole('navigation')).toContainText(/my tasks/i, { timeout: 15_000 });
  });

  test('admin can log in and see admin panel link', async ({ page }) => {
    await loginAs(page, 'admin');
    await expect(page.getByRole('navigation')).toContainText(/admin/i, { timeout: 15_000 });
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
      (document.querySelector('input[type="email"]') as HTMLInputElement)?.validity?.valid === false
    );
    expect(invalid).toBe(true);
  });

  test('strict live Supabase authentication succeeds when credentials configured', async ({ page }) => {
    const email = process.env.TEST_DONOR_EMAIL;
    const password = process.env.TEST_DONOR_PASSWORD;
    test.skip(!email || !password || password === 'REPLACE_ME', 'Live donor credentials not provided in environment');

    // Runs strict real UI login against Supabase — fails if credentials or network fail
    await loginWithCredentialsStrict(page, 'donor');
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('heading', { name: /dashboard|welcome back/i })).toBeVisible();
  });
});
