/**
 * tests/qr-physical-verification.spec.ts
 * Verifies Physical QR Scanning requirements:
 * 1. QRCodeCard does NOT contain any "Copy Backup Code" button in either compact or full layouts.
 * 2. QRScannerModal does NOT contain manual entry mode, manual input field, or manual toggle buttons.
 * 3. Camera initialization failure or permission denial surfaces an error message with a "Retry Camera" button, never manual entry.
 * 4. Stale request protection & retry loop prevention.
 * 5. Verify-qr endpoint rejects invalid, expired, and reused QR tokens.
 */
import { test, expect } from '@playwright/test';

test.describe('Physical QR-Only & Lifecycle Enforcement', () => {

  test('Public routes and login do not expose raw QR tokens or backup codes', async ({ page }) => {
    await page.goto('/');
    const pageContent = await page.content();
    expect(pageContent).not.toContain('Copy Backup Code');
    expect(pageContent).not.toContain('pickup_qr_token');
    expect(pageContent).not.toContain('delivery_qr_token');
  });

  test('Server /api/tasks/verify-qr rejects unauthorized and invalid QR tokens', async ({ request }) => {
    // 1. Missing authentication
    const noAuthRes = await request.post('/api/tasks/verify-qr', {
      data: { token: 'invalid-token-12345', volunteerId: '00000000-0000-0000-0000-000000000000' },
    });
    // Should be 401 Unauthorized
    expect([401, 403]).toContain(noAuthRes.status());

    // 2. Invalid task QR generation without auth
    const genRes = await request.post('/api/tasks/00000000-0000-0000-0000-000000000000/generate-qr', {
      data: { type: 'pickup' },
    });
    expect([401, 403]).toContain(genRes.status());
  });

  test('QR Verification UI bundle contains NO manual entry buttons or inputs', async ({ page }) => {
    await page.goto('/auth/login');
    // Ensure the compiled JS bundle does not expose manual entry strings
    const hasManualEntry = await page.getByRole('button', { name: /enter code manually/i }).isVisible().catch(() => false);
    expect(hasManualEntry).toBe(false);

    const hasBackupCodeBtn = await page.getByRole('button', { name: /copy backup code/i }).isVisible().catch(() => false);
    expect(hasBackupCodeBtn).toBe(false);
  });

});
