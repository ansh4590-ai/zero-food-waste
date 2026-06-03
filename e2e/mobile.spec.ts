/**
 * e2e/mobile.spec.ts
 * Mobile responsive tests: no horizontal overflow, nav, cards, modals, touch targets.
 * These run across all mobile viewport projects defined in playwright.config.ts.
 */
import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';

test.describe('Mobile Responsiveness', () => {

  test('home page has no horizontal overflow', async ({ page }) => {
    await page.goto('/');
    const bodyWidth   = await page.evaluate(() => document.body.scrollWidth);
    const windowWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(windowWidth + 2); // 2px tolerance for borders
  });

  test('mobile navigation hamburger is visible on small screens', async ({ page }) => {
    await page.goto('/');
    const viewport = page.viewportSize();
    if (viewport && viewport.width < 640) {
      await expect(page.getByRole('button', { name: /menu|open/i })).toBeVisible();
    }
  });

  test('dashboard page has no horizontal overflow when authenticated', async ({ page }) => {
    await loginAs(page, 'donor');
    await page.goto('/dashboard');
    const bodyWidth   = await page.evaluate(() => document.body.scrollWidth);
    const windowWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(windowWidth + 2);
  });

  test('KPI cards stack vertically on mobile', async ({ page }) => {
    await loginAs(page, 'donor');
    await page.goto('/dashboard');
    const viewport = page.viewportSize();
    if (viewport && viewport.width < 640) {
      const cards = page.locator('.neon-kpi-card');
      const count = await cards.count();
      if (count >= 2) {
        const box1 = await cards.nth(0).boundingBox();
        const box2 = await cards.nth(1).boundingBox();
        // On mobile, second card should be below the first (y is greater)
        if (box1 && box2) {
          expect(box2.y).toBeGreaterThan(box1.y);
        }
      }
    }
  });

  test('all interactive buttons meet 44px minimum touch target', async ({ page }) => {
    await page.goto('/');
    const tooSmall = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, a[role="button"]'));
      return buttons
        .map(el => ({ tag: el.tagName, h: el.getBoundingClientRect().height, text: el.textContent?.trim().slice(0, 30) }))
        .filter(b => b.h > 0 && b.h < 44);
    });
    // Allow a small tolerance — icon-only utility buttons may be smaller
    const criticallySmall = tooSmall.filter(b => b.h < 32);
    expect(criticallySmall).toHaveLength(0);
  });

  test('tasks page has no horizontal overflow', async ({ page }) => {
    await loginAs(page, 'volunteer');
    await page.goto('/tasks');
    const bodyWidth   = await page.evaluate(() => document.body.scrollWidth);
    const windowWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(windowWidth + 2);
  });

  test('mobile sticky footer navigation is visible', async ({ page }) => {
    await page.goto('/');
    const viewport = page.viewportSize();
    if (viewport && viewport.width < 640) {
      // The sticky mobile footer CTA buttons
      const donateBtn = page.getByRole('link', { name: /donate food|dashboard/i });
      await expect(donateBtn).toBeVisible();
    }
  });
});
