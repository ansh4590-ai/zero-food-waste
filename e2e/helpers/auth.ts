/**
 * e2e/helpers/auth.ts
 * Shared auth helpers for Playwright e2e tests.
 */
import { Page } from '@playwright/test';

export async function loginAs(page: Page, role: 'donor' | 'volunteer' | 'admin' | 'receiver') {
  const credentials: Record<string, { email: string; password: string }> = {
    donor:     { email: process.env.TEST_DONOR_EMAIL!,     password: process.env.TEST_DONOR_PASSWORD! },
    volunteer: { email: process.env.TEST_VOLUNTEER_EMAIL!, password: process.env.TEST_VOLUNTEER_PASSWORD! },
    admin:     { email: process.env.TEST_ADMIN_EMAIL!,     password: process.env.TEST_ADMIN_PASSWORD! },
    receiver:  { email: process.env.TEST_RECEIVER_EMAIL!,  password: process.env.TEST_RECEIVER_PASSWORD! },
  };

  const { email, password } = credentials[role];
  await page.goto('/auth/login');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in|log in|login/i }).click();
  // Wait for navigation away from login page
  await page.waitForURL(url => !url.pathname.includes('/auth/login'), { timeout: 15_000 });
}

export async function logout(page: Page) {
  await page.getByRole('button', { name: /logout/i }).click();
  await page.waitForURL('**/auth/login');
}
