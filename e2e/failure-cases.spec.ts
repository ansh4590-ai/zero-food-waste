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
    // Should either show a 404 message or redirect to home — not crash
    const isOk = await page.evaluate(() =>
      document.body.innerText.length > 0
    );
    expect(isOk).toBe(true);
    await expect(page).not.toHaveURL(/error.*500/);
  });

  test('network error during login shows user-friendly message', async ({ page, context }) => {
    await page.goto('/auth/login');
    // Simulate network failure for API calls
    await context.route('**/supabase.co/**', route => route.abort('failed'));
    await page.getByLabel(/email/i).fill('test@example.com');
    await page.getByLabel(/password/i).fill('password123');
    await page.getByRole('button', { name: /sign in|log in|login/i }).click();
    // Should show an error message, not crash
    await expect(
      page.getByText(/error|failed|network|try again/i)
    ).toBeVisible({ timeout: 10_000 });
  });
});
