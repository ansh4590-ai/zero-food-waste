import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';

// Load .env.test for test credentials
dotenv.config({ path: '.env.test' });

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['list'],
  ],

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    // ─── Desktop ────────────────────────────────────────────────────────────
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox-desktop',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit-desktop',
      use: { ...devices['Desktop Safari'] },
    },

    // ─── Mobile Viewport Matrix ─────────────────────────────────────────────
    {
      name: 'iphone-se',
      use: {
        ...devices['iPhone SE'],
        viewport: { width: 375, height: 667 },
      },
    },
    {
      name: 'iphone-14',
      use: {
        ...devices['iPhone 14'],
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: 'pixel-7',
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 412, height: 915 },
      },
    },
    {
      name: 'ipad-mini',
      use: {
        ...devices['iPad Mini'],
        viewport: { width: 768, height: 1024 },
      },
    },
    {
      name: 'desktop-1280',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
      },
    },
  ],

  // Start the dev server before running tests
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
