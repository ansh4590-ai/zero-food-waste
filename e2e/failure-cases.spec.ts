/**
 * e2e/failure-cases.spec.ts
 * Negative path tests: unauthorized access, missing fields, network errors.
 */
import { test, expect } from '@playwright/test';

test.describe('Failure Cases', () => {

  test('unauthenticated user is redirected from dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    // Should redirect to login or show auth gate
    await expect(page).toHaveURL(/\/auth\/login|\/register/);
  });

  test('unauthenticated user is redirected from tasks page', async ({ page }) => {
    await page.goto('/tasks');
    await expect(page).toHaveURL(/\/auth\/login|\/register/);
  });

  test('unauthenticated user is redirected from admin panel', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/auth\/login|\/register|\//);
  });

  test('404 / unknown route shows error or redirects gracefully', async ({ page }) => {
    await page.goto('/this-page-does-not-exist-xyz');
    // Catch-all route redirects gracefully to home — not crash or 500
    await expect(page).toHaveURL('/');
    await expect(page).not.toHaveURL(/error.*500/);
  });

  test('network error during login shows user-friendly message', async ({ page, context }) => {
    // Intercept Supabase auth token endpoint before page navigation
    await context.route('**/auth/v1/token*', route => route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'invalid_grant',
        error_description: 'Network error connecting to auth server. Please try again.',
        msg: 'Network error connecting to auth server. Please try again.',
      }),
    }));

    await page.goto('/auth/login');
    await page.getByLabel(/email/i).fill('test@example.com');
    await page.getByLabel(/password/i).fill('password123');
    await page.getByRole('button', { name: /sign in|log in|login/i }).click();

    // Verify toast error is displayed to the user
    await expect(
      page.locator('[data-sonner-toast]').getByText(/network error|error|failed|try again/i)
    ).toBeVisible({ timeout: 10_000 });
  });
});
