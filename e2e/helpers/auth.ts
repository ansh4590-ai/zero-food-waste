/**
 * e2e/helpers/auth.ts
 * Shared auth helpers for Playwright e2e tests.
 */
import { Page } from '@playwright/test';

export async function loginAs(page: Page, role: 'donor' | 'volunteer' | 'admin' | 'receiver') {
  const credentials: Record<string, { email?: string; password?: string }> = {
    donor:     { email: process.env.TEST_DONOR_EMAIL,     password: process.env.TEST_DONOR_PASSWORD },
    volunteer: { email: process.env.TEST_VOLUNTEER_EMAIL, password: process.env.TEST_VOLUNTEER_PASSWORD },
    admin:     { email: process.env.TEST_ADMIN_EMAIL,     password: process.env.TEST_ADMIN_PASSWORD },
    receiver:  { email: process.env.TEST_RECEIVER_EMAIL,  password: process.env.TEST_RECEIVER_PASSWORD },
  };

  const cred = credentials[role];
  const hasValidCreds = Boolean(cred?.email && cred?.password && cred.password !== 'REPLACE_ME');

  if (hasValidCreds) {
    if (role === 'admin') {
      await page.goto('/admin-login');
      await page.getByLabel(/admin email|email/i).fill(cred!.email!);
      await page.getByLabel(/password/i).fill(cred!.password!);
      await page.getByRole('button', { name: /sign in|log in|login/i }).click();
      await page.waitForURL(url => !url.pathname.includes('/admin-login'), { timeout: 15_000 });
    } else {
      await page.goto('/auth/login');
      await page.getByLabel(/email/i).fill(cred!.email!);
      await page.getByLabel(/password/i).fill(cred!.password!);
      await page.getByRole('button', { name: /sign in|log in|login/i }).click();
      await page.waitForURL(url => !url.pathname.includes('/auth/login'), { timeout: 15_000 });
    }
    return;
  }

  // Fallback when test environment / CI has no live external credentials:
  // Inject mock user and authentication state so all dashboard and role views can be tested deterministically.
  const roleIds: Record<string, string> = {
    donor:     '00000000-0000-0000-0000-000000000001',
    volunteer: 'fb5bf226-d896-4de1-ab33-a260044e6242',
    admin:     '00000000-0000-0000-0000-000000000003',
    receiver:  '00000000-0000-0000-0000-000000000004',
  };

  // Canonical permission sets per role (mirrors what the DB should contain)
  const rolePermissions: Record<string, string[]> = {
    donor:     ['food.create', 'food.update_own', 'food.delete_own'],
    volunteer: ['tasks.view_assigned', 'food.read_all', 'requests.read_all'],
    admin:     ['users.read', 'users.verify', 'food.create', 'food.update_own', 'food.delete_own', 'food.read_all', 'requests.create', 'requests.update', 'requests.read_own', 'requests.read_all', 'donations.manage', 'tasks.view_assigned'],
    receiver:  ['requests.create', 'requests.update', 'requests.read_own', 'food.read_all'],
  };

  const userId = roleIds[role];
  const userEmail = `${role}@test.local`;
  const mockSession = {
    access_token: 'mock-test-jwt-token',
    refresh_token: 'mock-test-refresh-token',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user: {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      email: userEmail,
      user_metadata: { role, full_name: `Test ${role.charAt(0).toUpperCase() + role.slice(1)}` },
      app_metadata: { provider: 'email' },
    },
  };

  await page.addInitScript(({ session, userRole, permissions }) => {
    // Inject into localStorage so Supabase & useAuthStore load the session (DEV-only path)
    try {
      localStorage.setItem('sb-test-auth-token', JSON.stringify(session));
      localStorage.setItem('sb-pjxrikmnahjbalhtmfkf-auth-token', JSON.stringify(session));
      localStorage.setItem('test_access_token', session.access_token);
      // Also write common supabase client storage keys
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
          localStorage.setItem(key, JSON.stringify(session));
        }
      }
    } catch {}
    // Inject RBAC override so RBACContext skips the live Supabase query in DEV
    (window as any).__testRBACOverride = { role: userRole, permissions };
  }, { session: mockSession, userRole: role, permissions: rolePermissions[role] });

  // Navigate to appropriate landing page
  const targetPath = role === 'admin' ? '/admin' : role === 'volunteer' ? '/tasks' : '/dashboard';
  await page.goto(targetPath);
}

export async function logout(page: Page) {
  const logoutBtn = page.locator('button[aria-label="Logout"], button[title="Logout"], button:has-text("Logout")').first();
  if (await logoutBtn.isVisible()) {
    await logoutBtn.click();
  } else {
    await page.evaluate(() => {
      localStorage.clear();
      window.location.href = '/auth/login';
    });
  }
  await page.waitForURL('**/auth/login', { timeout: 10_000 });
}
