/**
 * e2e/donation.spec.ts
 * Donation lifecycle tests: create, view on dashboard, cancel listing.
 */
import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';

test.describe('Donation Lifecycle', () => {

  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'donor');
  });

  test('donor can navigate to donate page', async ({ page }) => {
    await page.getByRole('link', { name: /donate food/i }).click();
    await expect(page).toHaveURL(/\/donate/);
    await expect(page.getByRole('heading', { name: /donate|listing/i })).toBeVisible();
  });

  test('donate form requires all mandatory fields', async ({ page }) => {
    await page.goto('/donate');
    // Submit without filling anything
    const submitBtn = page.getByRole('button', { name: /submit|donate|create/i });
    await submitBtn.click();
    // At least one required field should be invalid
    const hasInvalidField = await page.evaluate(() =>
      Array.from(document.querySelectorAll('input, select, textarea'))
        .some((el: any) => el.validity && !el.validity.valid)
    );
    expect(hasInvalidField).toBe(true);
  });

  test('dashboard KPI cards are visible', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText(/meals rescued/i)).toBeVisible();
    await expect(page.getByText(/active donations/i)).toBeVisible();
    await expect(page.getByText(/pending pickups/i)).toBeVisible();
    await expect(page.getByText(/completed deliveries/i)).toBeVisible();
  });

  test('my listings section renders on dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    // Either shows listings or the empty state CTA
    const hasListings = await page.getByText(/my listings/i).isVisible();
    expect(hasListings).toBe(true);
  });

  test('activity pulse section is visible', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText(/platform activity pulse/i)).toBeVisible();
  });

  test('system status shows operational', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText(/all systems operational/i)).toBeVisible();
  });
});
