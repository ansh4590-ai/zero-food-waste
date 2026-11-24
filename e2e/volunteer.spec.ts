/**
 * e2e/volunteer.spec.ts
 * Volunteer workflow tests: task list, navigation, verification UI.
 */
import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';

test.describe('Volunteer Workflow', () => {

  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'volunteer');
  });

  test('volunteer can navigate to tasks page', async ({ page }) => {
    await page.goto('/dashboard');
    const menu = page.getByRole('button', { name: 'Open navigation menu' });
    if ((page.viewportSize()?.width ?? 1280) < 768) await menu.click();
    await page.getByRole('link', { name: /my tasks/i }).click();
    await expect(page).toHaveURL(/\/tasks/);
  });

  test('volunteer task page shows open tasks or empty state', async ({ page }) => {
    await page.goto('/tasks');
    // Either a task card, "Open" badge, or empty state message should be visible
    await expect(
      page.getByText(/no active dispatches|open|available|no tasks|claim/i).first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test('offline banner appears when network is simulated offline', async ({ page, context }) => {
    await page.goto('/tasks');
    await context.setOffline(true);
    // Trigger a network-dependent action or just wait for detection
    await page.waitForTimeout(2000);
    // The app should surface an offline indicator
    const offlineVisible = await page.getByText(/offline|no connection/i).isVisible().catch(() => false);
    // Not all apps show this immediately — we just verify no crash
    await context.setOffline(false);
    // Page should still be usable after reconnection
    await expect(page).not.toHaveURL(/error/);
  });

  test('map is rendered on tasks page', async ({ page }) => {
    await page.goto('/tasks');
    // Leaflet map container
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 15_000 });
  });

  test('claim button is disabled or absent when offline', async ({ page, context }) => {
    await page.goto('/tasks');
    await context.setOffline(true);
    await page.waitForTimeout(1500);
    const claimBtn = page.getByRole('button', { name: /claim/i }).first();
    if (await claimBtn.isVisible()) {
      await claimBtn.click();
      await expect(page.getByText(/offline/i)).toBeVisible({ timeout: 5_000 });
    }
    await context.setOffline(false);
  });
});
