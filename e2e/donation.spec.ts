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
    const donateLinkOrBtn = page.locator('main button:has-text("Donate Food"), a[href*="/donate"]').first();
    await donateLinkOrBtn.waitFor({ state: 'visible', timeout: 15_000 });
    await donateLinkOrBtn.click();
    await page.waitForURL('**/donate', { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: /donate surplus food/i })).toBeVisible({ timeout: 15_000 });
  });

  test('donate form requires all mandatory fields', async ({ page }) => {
    await page.goto('/donate');
    // Wait for the donate form inputs to render
    await expect(page.locator('input[required]').first()).toBeAttached();
    const requiredInputs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('input[required], select[required], textarea[required]')).length
    );
    expect(requiredInputs).toBeGreaterThan(0);
  });

  test('dashboard KPI cards are visible', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText(/meals donated/i)).toBeVisible();
    await expect(page.getByText(/active listings/i)).toBeVisible();
    await expect(page.getByText(/successful deliveries/i)).toBeVisible();
    await expect(page.getByText(/impact score/i)).toBeVisible();
  });

  test('recent donations section renders on dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText(/recent donations/i)).toBeVisible();
  });

  test('upcoming pickups section is visible on dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText(/upcoming pickups/i)).toBeVisible();
  });
});
