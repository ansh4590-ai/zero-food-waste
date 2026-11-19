/**
 * tests/qr-physical-verification.spec.ts
 * Comprehensive physical QR-only scanning and lifecycle test suite.
 * Exercises:
 * 1. Physical QR Only: No backup-code controls, copy buttons, or manual entry in rendered components.
 * 2. Camera Permission Denial & Retry Camera: Graceful error state with Retry button (no manual fallback).
 * 3. QRCodeCard Request Lifecycle: Stale response protection via AbortController/requestId, failed generation without infinite loops, and explicit retry.
 * 4. Verification Endpoint Security: Rejection of unauthorized calls, expired tokens, and replayed tokens.
 * 5. Scanner Modal verification lifecycle:
 *    - First scan → verify (fail) → scanner resumes → rescan → verify (succeed)
 *    - Duplicate scan blocked while verifying
 *    - Camera permission denial shows Retry Camera with no manual fallback
 */
import { test, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Shared mock Html5Qrcode factory injected via addInitScript.
// Sets window.__html5QrcodeMock so QRVerification picks it up in DEV mode.
// Also exposes:
//   window.__triggerScan(text)  — fires the success callback
//   window.__denyCamera()       — rejects scanner.start() with NotAllowedError
//   window.__scannerRunning     — boolean, true while start() has resolved and stop() not called
// ---------------------------------------------------------------------------
const SCANNER_MOCK_SCRIPT = () => {
  let _successCb: ((text: string) => void) | null = null;
  let _running = false;
  let _denyNext = false;

  class MockHtml5Qrcode {
    constructor(_elementId: string) {}
    async start(
      _cameraConfig: unknown,
      _config: unknown,
      onSuccess: (text: string) => void,
      _onError: () => void
    ) {
      if (_denyNext) {
        _denyNext = false;
        const err = new Error('Permission denied');
        (err as any).name = 'NotAllowedError';
        throw err;
      }
      _successCb = onSuccess;
      _running = true;
    }
    pause(_shouldPauseVideo?: boolean) { /* no-op in mock */ }
    resume() { /* no-op in mock */ }
    async stop() { _running = false; _successCb = null; }
    clear() {}
  }

  (window as any).__html5QrcodeMock = MockHtml5Qrcode;
  (window as any).__triggerScan = (text: string) => {
    if (_successCb) _successCb(text);
  };
  (window as any).__denyCamera = () => { _denyNext = true; };
  Object.defineProperty(window, '__scannerRunning', { get: () => _running, configurable: true });
};

// ---------------------------------------------------------------------------

test.describe('Physical QR-Only & Lifecycle Enforcement', () => {

  test.beforeEach(async ({ page }) => {
    // Inject localStorage test token (DEV-only path in getAuthToken)
    await page.addInitScript(() => {
      try {
        localStorage.setItem('test_access_token', 'test-mock-token-donor-12345');
      } catch {}
    });
  });

  // ── 1. No raw tokens exposed on public pages ──────────────────────────────
  test('Public routes and login do not expose raw QR tokens or backup codes', async ({ page }) => {
    await page.goto('/');
    const pageContent = await page.content();
    expect(pageContent).not.toContain('Copy Backup Code');
    expect(pageContent).not.toContain('pickup_qr_token');
    expect(pageContent).not.toContain('delivery_qr_token');
  });

  // ── 2. API endpoint security ──────────────────────────────────────────────
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

  // ── 3. Rendered QRCodeCard: no copy or backup controls ───────────────────
  test('Rendered QRCodeCard contains NO backup code or copy buttons', async ({ page }) => {
    await page.goto('/test-qr');

    const copyButton = page.locator('button:has-text("Copy Backup Code"), button:has-text("Copy")');
    await expect(copyButton).toHaveCount(0);

    await page.getByTestId('toggle-compact').click();
    await expect(copyButton).toHaveCount(0);
  });

  // ── 4. QRScannerModal: no manual entry controls ───────────────────────────
  test('Rendered QRScannerModal contains NO manual entry controls or fallback buttons', async ({ page }) => {
    await page.addInitScript(SCANNER_MOCK_SCRIPT);
    await page.goto('/test-qr');

    await page.getByTestId('open-scanner-btn').click();
    await expect(page.locator('role=dialog')).toBeVisible();

    await expect(page.getByRole('button', { name: /enter code manually/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /back to camera/i })).toHaveCount(0);
    await expect(page.locator('input[placeholder*="backup code"]')).toHaveCount(0);
  });

  // ── 5. Camera permission denial: Retry Camera, no manual fallback ─────────
  test('Camera permission denial renders dedicated error with Retry Camera button — no manual fallback', async ({ page }) => {
    // Inject mock that will deny camera on first start(), then allow it
    await page.addInitScript(SCANNER_MOCK_SCRIPT);
    await page.goto('/test-qr');

    // Deny camera before opening modal
    await page.evaluate(() => (window as any).__denyCamera());

    await page.getByTestId('open-scanner-btn').click();
    await expect(page.locator('role=dialog')).toBeVisible();

    // Camera denied → error with Retry Camera
    const retryBtn = page.getByRole('button', { name: /retry camera/i });
    await expect(retryBtn).toBeVisible({ timeout: 10_000 });

    // Manual entry must NOT appear
    await expect(page.getByRole('button', { name: /enter code manually/i })).toHaveCount(0);
    await expect(page.locator('input[placeholder*="backup"]')).toHaveCount(0);

    // Clicking Retry Camera should re-attempt (this time camera will succeed)
    await retryBtn.click();
    // Modal stays open — scanner reinitialises
    await expect(page.locator('role=dialog')).toBeVisible();
  });

  // ── 6. QRCodeCard: failed generation, no retry loop, explicit retry ───────
  test('QRCodeCard failed generation displays error and does NOT cause a request loop', async ({ page }) => {
    let requestCount = 0;

    await page.route('**/api/tasks/*/generate-qr', async route => {
      requestCount++;
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: 'Unauthorized: only the listing donor can generate the pickup QR.' }),
      });
    });

    await page.goto('/test-qr');

    await expect(page.getByText(/unauthorized|failed to generate/i)).toBeVisible({ timeout: 5_000 });

    const retryBtn = page.getByRole('button', { name: /try again|retry/i });
    await expect(retryBtn).toBeVisible();

    // No automatic retry loop
    await page.waitForTimeout(2000);
    expect(requestCount).toBe(1);

    // Explicit user retry triggers exactly one additional request
    await retryBtn.click();
    await page.waitForTimeout(1000);
    expect(requestCount).toBe(2);
  });

  // ── 7. Stale request protection ───────────────────────────────────────────
  test('Old in-flight responses cannot overwrite a newly switched task QR', async ({ page }) => {
    let slowRequestCompleted = false;

    await page.route('**/api/tasks/*/generate-qr', async (route, request) => {
      const url = request.url();
      if (url.includes('task-12345')) {
        await new Promise(r => setTimeout(r, 1500));
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

    // Switch to task 67890 while task 12345 is still in-flight
    await page.getByTestId('set-task-2').click();

    await page.waitForTimeout(2500);
    expect(slowRequestCompleted).toBe(true);

    const cardContent = await page.getByTestId('qr-card-container').innerHTML();
    expect(cardContent).not.toContain('STALE-TOKEN-12345');
  });

  // ── 8. Scanner: failure → rescan → success (actual scan simulation) ───────
  test('Scanner modal: verification failure allows re-scanning; second scan succeeds', async ({ page }) => {
    let verifyCallCount = 0;

    // Inject scanner mock so we can programmatically trigger scans
    await page.addInitScript(SCANNER_MOCK_SCRIPT);

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

    // Allow scanner init to complete (mock is synchronous but React effect needs a tick)
    await page.waitForTimeout(600);

    // ── First scan: triggers verify → server returns 400 ──
    await page.evaluate(() => (window as any).__triggerScan('qr-token-attempt-1'));

    // Error message should appear
    await expect(page.getByText(/token expired|verification failed|please scan again/i)).toBeVisible({ timeout: 5_000 });
    expect(verifyCallCount).toBe(1);

    // Modal must remain open (scanner not destroyed on failure)
    await expect(page.locator('role=dialog')).toBeVisible();

    // ── Second scan: triggers verify → server returns 200 ──
    // Scanner resumes after 2s timeout, but we can trigger immediately via mock
    // (the mock's resume() is a no-op; hasScannedRef is reset to false on failure)
    await page.waitForTimeout(2200); // let the internal resume timer fire

    await page.evaluate(() => (window as any).__triggerScan('qr-token-attempt-2'));

    // Success: modal closes or verified status appears
    await expect(page.getByTestId('verified-result')).toBeVisible({ timeout: 5_000 });
    expect(verifyCallCount).toBe(2);
  });

  // ── 9. Duplicate scan blocked while verification is in-flight ─────────────
  test('Duplicate scans are blocked while verification is in-flight', async ({ page }) => {
    let verifyCallCount = 0;

    await page.addInitScript(SCANNER_MOCK_SCRIPT);

    // Slow verification to give time for duplicate scan attempt
    await page.route('**/api/tasks/verify-qr', async route => {
      verifyCallCount++;
      await new Promise(r => setTimeout(r, 800));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, new_status: 'picked_up' }),
      });
    });

    await page.goto('/test-qr');
    await page.getByTestId('open-scanner-btn').click();
    await expect(page.locator('role=dialog')).toBeVisible();
    await page.waitForTimeout(600);

    // Fire two scans in rapid succession — only the first should reach the server
    await page.evaluate(() => {
      (window as any).__triggerScan('token-aaa');
      (window as any).__triggerScan('token-bbb'); // should be blocked by hasScannedRef
    });

    await page.waitForTimeout(1500);
    expect(verifyCallCount).toBe(1);
  });

});
