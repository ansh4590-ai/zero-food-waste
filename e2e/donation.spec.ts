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
    const menu = page.getByRole('button', { name: 'Open navigation menu' });
    if ((page.viewportSize()?.width ?? 1280) < 768) await menu.click();
    const donateLinkOrBtn = page.locator('main button:has-text("Donate Food"), a[href*="/donate"]').first();
    await donateLinkOrBtn.waitFor({ state: 'visible', timeout: 15_000 });
    await donateLinkOrBtn.click();
    await page.waitForURL('**/donate', { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: /donate surplus food/i })).toBeVisible({ timeout: 15_000 });
  });

  test('compresses a phone-sized photo before sending it for classification', async ({ page }) => {
    await page.route('**/api/classify', route => route.fulfill({
      json: { is_food: true, title: 'Test meal', predicted_category: 'cooked_meal' },
    }));
    await page.goto('/donate');
    const upload = page.locator('input[type="file"]');
    await upload.waitFor({ state: 'attached' });
    const request = page.waitForRequest(req => new URL(req.url()).pathname === '/api/classify');

    const originalSize = await upload.evaluate(async (element: HTMLInputElement) => {
      const canvas = document.createElement('canvas');
      canvas.width = 1800;
      canvas.height = 900;
      const ctx = canvas.getContext('2d')!;
      const pixels = ctx.createImageData(canvas.width, canvas.height);
      // Noise keeps the source PNG large without a multi-megabyte test asset.
      const bytes = new Uint8Array(pixels.data.buffer);
      for (let offset = 0; offset < bytes.length; offset += 65536) {
        crypto.getRandomValues(bytes.subarray(offset, offset + 65536));
      }
      for (let alpha = 3; alpha < bytes.length; alpha += 4) bytes[alpha] = 255;
      ctx.putImageData(pixels, 0, 0);
      const png = await new Promise<Blob>(resolve => canvas.toBlob(blob => resolve(blob!), 'image/png'));
      const transfer = new DataTransfer();
      transfer.items.add(new File([png], 'donation.png', { type: 'image/png' }));
      element.files = transfer.files;
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return png.size;
    });
    expect(originalSize).toBeGreaterThan(3 * 1024 * 1024);
    const encoded = (await request).postDataJSON().imageBase64;
    expect(encoded).toMatch(/^data:image\/jpeg;base64,/);
    expect(Buffer.from(encoded.split(',')[1], 'base64').length).toBeLessThanOrEqual(3 * 1024 * 1024);
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
    await expect(page.getByRole('heading', { name: 'Upcoming Pickups', exact: true })).toBeVisible({ timeout: 15_000 });
  });
});
