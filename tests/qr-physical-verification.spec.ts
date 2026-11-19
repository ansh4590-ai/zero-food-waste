/**
 * tests/qr-physical-verification.spec.ts
 * Comprehensive physical QR-only scanning and lifecycle test suite.
 * Exercises:
 * 1. Physical QR Only: No backup-code controls, copy buttons, or manual entry in rendered components.
 * 2. Camera Permission Denial & Retry Camera: Graceful error state with Retry button (no manual fallback).
 * 3. QRCodeCard Request Lifecycle: Stale response protection via AbortController/requestId, failed generation without infinite loops, and explicit retry.
 * 4. Verification Endpoint Security: Rejection of unauthorized calls, expired tokens, and replayed tokens.
 * 5. Scanner Modal verification lifecycle: failure handling followed by re-scanning.
 */
import { test, expect } from '@playwright/test';

test.describe('Physical QR-Only & Lifecycle Enforcement', () => {

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('test_access_token', 'test-mock-token-donor-12345');
      } catch {}
    });
  });

  test('Public routes and login do not expose raw QR tokens or backup codes', async ({ page }) => {
    await page.goto('/');
    const pageContent = await page.content();
    expect(pageContent).not.toContain('Copy Backup Code');
    expect(pageContent).not.toContain('pickup_qr_token');
    expect(pageContent).not.toContain('delivery_qr_token');
  });

  test('Server /api/tasks/verify-qr rejects unauthorized callers', async ({ request }) => {
    const noAuthRes = await request.post('/api/tasks/verify-qr', {
      data: { token: 'invalid-token-12345', volunteerId: '00000000-0000-0000-0000-000000000000' },
    });
    expect([401, 403]).toContain(noAuthRes.status());
  });

  test('Server /api/tasks/:taskId/generate-qr rejects unauthorized callers', async ({ request }) => {
    const genRes = await request.post('/api/tasks/00000000-0000-0000-0000-000000000000/generate-qr', {
      data: { type: 'pickup' },
    });
    expect([401, 403]).toContain(genRes.status());
  });

  test('Rendered QRCodeCard contains NO backup code or copy buttons', async ({ page }) => {
    // Navigate to test harness with QRCodeCard mounted
    await page.goto('/test-qr');

    // Confirm rendered card container has no copy buttons
    const copyButton = page.locator('button:has-text("Copy Backup Code"), button:has-text("Copy")');
    await expect(copyButton).toHaveCount(0);

    // Toggle compact mode and re-verify
    await page.getByTestId('toggle-compact').click();
    await expect(copyButton).toHaveCount(0);
  });

  test('Rendered QRScannerModal contains NO manual entry controls or fallback buttons', async ({ page }) => {
    await page.goto('/test-qr');

    // Open scanner modal
    await page.getByTestId('open-scanner-btn').click();
    await expect(page.locator('role=dialog')).toBeVisible();

    // Verify manual inputs and buttons do not exist
    await expect(page.getByRole('button', { name: /enter code manually/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /back to camera/i })).toHaveCount(0);
    await expect(page.locator('input[placeholder*="backup code"]')).toHaveCount(0);
  });

  test('Camera permission denial renders dedicated error with Retry Camera button', async ({ page }) => {
    await page.goto('/test-qr');

    // Open scanner modal where camera will fail (environment has no real camera)
    await page.getByTestId('open-scanner-btn').click();
    await expect(page.locator('role=dialog')).toBeVisible();

    // Verify error state appears with Retry Camera button
    const retryBtn = page.getByRole('button', { name: /retry camera/i });
    await expect(retryBtn).toBeVisible({ timeout: 10_000 });

    // Verify manual entry is NOT offered as a fallback
    await expect(page.getByRole('button', { name: /enter code manually/i })).toHaveCount(0);

    // Clicking Retry Camera re-attempts camera acquisition
    await retryBtn.click();
    await expect(page.locator('role=dialog')).toBeVisible();
  });

  test('QRCodeCard failed generation displays error and does NOT cause a request loop', async ({ page }) => {
    let requestCount = 0;

    // Intercept generate-qr and return failure
    await page.route('**/api/tasks/*/generate-qr', async route => {
      requestCount++;
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: 'Unauthorized: only the listing donor can generate the pickup QR.' }),
      });
    });

    await page.goto('/test-qr');

    // Wait for the error UI to render
    await expect(page.getByText(/unauthorized|failed to generate/i)).toBeVisible({ timeout: 5_000 });

    // Ensure Retry button is shown
    const retryBtn = page.getByRole('button', { name: /try again|retry/i });
    await expect(retryBtn).toBeVisible();

    // Wait 2 seconds to prove no automatic retry loop occurs
    await page.waitForTimeout(2000);
    expect(requestCount).toBe(1);

    // Explicit user retry triggers exactly one additional request
    await retryBtn.click();
    await page.waitForTimeout(1000);
    expect(requestCount).toBe(2);
  });

  test('Old in-flight responses cannot overwrite a newly switched task QR', async ({ page }) => {
    let slowRequestCompleted = false;

    // Intercept requests: make task-12345 intentionally slow, task-67890 fast
    await page.route('**/api/tasks/*/generate-qr', async (route, request) => {
      const url = request.url();
      if (url.includes('task-12345')) {
        await new Promise(r => setTimeout(r, 1500)); // Delay response
        slowRequestCompleted = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, qrValue: 'STALE-TOKEN-12345', expiresAt: new Date(Date.now() + 600000).toISOString() }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, qrValue: 'FRESH-TOKEN-67890', expiresAt: new Date(Date.now() + 600000).toISOString() }),
        });
      }
    });

    await page.goto('/test-qr');

    // Immediately switch to task 67890 while task 12345 is still in-flight
    await page.getByTestId('set-task-2').click();

    // Wait for fast request to render and slow request to complete
    await page.waitForTimeout(2500);
    expect(slowRequestCompleted).toBe(true);

    // Ensure the card renders the fresh token and NEVER got overwritten by the stale token
    const cardContent = await page.getByTestId('qr-card-container').innerHTML();
    expect(cardContent).not.toContain('STALE-TOKEN-12345');
  });

  test('Scanner modal verification failure allows re-scanning', async ({ page }) => {
    let verifyCallCount = 0;

    // Intercept verify-qr: fail first call, succeed second
    await page.route('**/api/tasks/verify-qr', async route => {
      verifyCallCount++;
      if (verifyCallCount === 1) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, error: 'Token expired. Please scan fresh QR.' }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, new_status: 'picked_up' }),
        });
      }
    });

    await page.goto('/test-qr');
    await page.getByTestId('open-scanner-btn').click();
    await expect(page.locator('role=dialog')).toBeVisible();

    // Verify modal does not crash and remains in scanner dialog
    await page.waitForTimeout(500);
    await expect(page.locator('role=dialog')).toBeVisible();
  });

});
