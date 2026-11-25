/**
 * e2e/donation.spec.ts
 * Donation lifecycle tests: create, view on dashboard, cancel listing.
 */
import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';

async function pickFutureDateTime(page: import('@playwright/test').Page, triggerText: RegExp, hourStr: string) {
  await page.getByRole('button', { name: triggerText }).click();
  // Advance one month so day 15 is always in the future
  await page.locator('div.fixed button:has(svg.lucide-chevron-right)').click();
  await page.locator('div.fixed button:not([disabled])', { hasText: /^15$/ }).first().click();
  await page.locator('div.fixed div:has(> div:text-is("Hr")) button', { hasText: new RegExp(`^${hourStr}$`) }).first().click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
}

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

  test('editing address after selecting A invalidates coordinates until a new suggestion is selected', async ({ page }) => {
    await page.route('**/api/classify', route => route.fulfill({
      json: { is_food: true, title: 'Fresh Pasta', predicted_category: 'cooked_meal' },
    }));
    await page.route('https://photon.komoot.io/api/*', route => route.fulfill({
      json: {
        features: [{
          geometry: { coordinates: [72.8777, 19.076] },
          properties: { osm_id: 1, name: 'Address Alpha', city: 'Mumbai', state: 'MH', country: 'India' },
        }],
      },
    }));

    await page.goto('/donate');

    const upload = page.locator('input[type="file"]');
    await upload.waitFor({ state: 'attached' });
    await upload.evaluate(async (el: HTMLInputElement) => {
      const canvas = document.createElement('canvas');
      canvas.width = 40;
      canvas.height = 40;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(0, 0, 40, 40);
      const blob = await new Promise<Blob>(r => canvas.toBlob(b => r(b!), 'image/png'));
      const dt = new DataTransfer();
      dt.items.add(new File([blob], 'food.png', { type: 'image/png' }));
      el.files = dt.files;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await page.locator('#title').fill('Fresh Pasta');
    await page.locator('#quantity').fill('10 plates');

    await pickFutureDateTime(page, /pick expiry date & time/i, '14');
    await pickFutureDateTime(page, /start time/i, '10');
    await pickFutureDateTime(page, /end time/i, '12');

    const addressInput = page.locator('#address');
    await addressInput.fill('Address Alpha');
    const suggestion = page.locator('ul li', { hasText: 'Address Alpha' }).first();
    await suggestion.waitFor({ state: 'visible', timeout: 10_000 });
    await suggestion.click();
    await expect(page.locator('.leaflet-marker-icon')).toBeVisible({ timeout: 5_000 });

    await addressInput.fill('Address Beta');
    await expect(page.locator('.leaflet-marker-icon')).toHaveCount(0);

    await page.getByRole('button', { name: /next: review/i }).click();
    await expect(page.getByText(/please select a pickup address from the suggestions/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('heading', { name: /review your donation/i })).toHaveCount(0);
  });

  test('delayed GPS callback after selecting address B does not overwrite B coordinates', async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__gpsCallbackRegistered = false;
      (window as any).__triggerDelayedGps = null;
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: {
          getCurrentPosition: (success: PositionCallback) => {
            (window as any).__gpsCallbackRegistered = true;
            (window as any).__triggerDelayedGps = () =>
              success({
                coords: {
                  latitude: 12.9716,
                  longitude: 77.5946,
                  accuracy: 10,
                  altitude: null,
                  altitudeAccuracy: null,
                  heading: null,
                  speed: null,
                  toJSON: () => ({}),
                },
                timestamp: Date.now(),
                toJSON: () => ({}),
              } as GeolocationPosition);
          },
        },
      });
    });

    await page.route('**/api/classify', route => route.fulfill({
      json: { is_food: true, title: 'Rice Bowls', predicted_category: 'cooked_meal' },
    }));
    await page.route('https://photon.komoot.io/api/*', route => route.fulfill({
      json: {
        features: [{
          geometry: { coordinates: [77.209, 28.6139] },
          properties: { osm_id: 2, name: 'Address Beta', city: 'Delhi', state: 'DL', country: 'India' },
        }],
      },
    }));

    let insertedPayload: any = null;
    await page.route('**/storage/v1/object/food_images/**', route => route.fulfill({ status: 200, json: { Key: 'food_images/test.png' } }));
    await page.route('**/rest/v1/food_listings*', async (route) => {
      if (route.request().method() === 'POST') {
        insertedPayload = route.request().postDataJSON();
        return route.fulfill({ status: 201, json: [{ id: insertedPayload?.id || '1' }] });
      }
      return route.fulfill({ status: 200, json: null });
    });

    await page.goto('/donate');

    const upload = page.locator('input[type="file"]');
    await upload.waitFor({ state: 'attached' });
    await upload.evaluate(async (el: HTMLInputElement) => {
      const canvas = document.createElement('canvas');
      canvas.width = 40;
      canvas.height = 40;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(0, 0, 40, 40);
      const blob = await new Promise<Blob>(r => canvas.toBlob(b => r(b!), 'image/png'));
      const dt = new DataTransfer();
      dt.items.add(new File([blob], 'food.png', { type: 'image/png' }));
      el.files = dt.files;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await page.locator('#title').fill('Rice Bowls');
    await page.locator('#quantity').fill('15 bowls');

    await pickFutureDateTime(page, /pick expiry date & time/i, '14');
    await pickFutureDateTime(page, /start time/i, '10');
    await pickFutureDateTime(page, /end time/i, '12');

    const addressInput = page.locator('#address');
    await addressInput.fill('Address Beta');
    const suggestion = page.locator('ul li', { hasText: 'Address Beta' }).first();
    await suggestion.waitFor({ state: 'visible', timeout: 10_000 });
    await suggestion.click();

    await expect.poll(() => page.evaluate(() => (window as any).__gpsCallbackRegistered), { timeout: 5_000 }).toBe(true);
    await page.evaluate(() => {
      (window as any).__triggerDelayedGps();
    });

    await page.getByRole('button', { name: /next: review/i }).click();
    await expect(page.getByRole('heading', { name: /review your donation/i })).toBeVisible({ timeout: 5_000 });
    await page.getByRole('button', { name: /confirm & publish/i }).click();
    await expect.poll(() => insertedPayload?.pickup_lat, { timeout: 10_000 }).toBe(28.6139);
    expect(insertedPayload.pickup_lng).toBe(77.209);
  });

  test('retry after lost insert response reconciles 23505 without deleting photo when first lookup sees no row', async ({ page }) => {
    await page.route('**/api/classify', route => route.fulfill({
      json: { is_food: true, title: 'Curry Trays', predicted_category: 'cooked_meal' },
    }));
    await page.route('https://photon.komoot.io/api/*', route => route.fulfill({
      json: {
        features: [{
          geometry: { coordinates: [77.209, 28.6139] },
          properties: { osm_id: 3, name: 'Connaught Place', city: 'Delhi', state: 'DL', country: 'India' },
        }],
      },
    }));

    let deleteCalls = 0;
    let uploadCalls = 0;
    let postAttempt = 0;
    let getAttempt = 0;
    let savedImageUrl = '';

    await page.route('**/storage/v1/object/food_images/**', async (route) => {
      if (route.request().method() === 'DELETE') {
        deleteCalls += 1;
        return route.fulfill({ status: 200, json: [] });
      }
      uploadCalls += 1;
      return route.fulfill({ status: 200, json: { Key: 'food_images/test.png' } });
    });

    await page.route('**/rest/v1/food_listings*', async (route) => {
      if (route.request().method() === 'POST') {
        postAttempt += 1;
        const body = route.request().postDataJSON();
        savedImageUrl = body.image_url;
        if (postAttempt === 1) {
          // Simulate lost response after server-side insert is still in flight
          return route.abort('timedout');
        }
        // Retry sees 23505 because the first insert committed
        return route.fulfill({
          status: 409,
          contentType: 'application/json',
          json: { code: '23505', message: 'duplicate key value violates unique constraint' },
        });
      }
      if (route.request().method() === 'GET') {
        getAttempt += 1;
        if (getAttempt === 1) {
          // First lookup sees no row while original insert is still in flight
          return route.fulfill({ status: 200, contentType: 'application/json', json: null });
        }
        // Second lookup (after 23505) confirms the committed row with the same image_url
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          json: { id: 'confirmed-id', image_url: savedImageUrl },
        });
      }
      return route.continue();
    });

    await page.goto('/donate');

    const upload = page.locator('input[type="file"]');
    await upload.waitFor({ state: 'attached' });
    await upload.evaluate(async (el: HTMLInputElement) => {
      const canvas = document.createElement('canvas');
      canvas.width = 40;
      canvas.height = 40;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(0, 0, 40, 40);
      const blob = await new Promise<Blob>(r => canvas.toBlob(b => r(b!), 'image/png'));
      const dt = new DataTransfer();
      dt.items.add(new File([blob], 'food.png', { type: 'image/png' }));
      el.files = dt.files;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await page.locator('#title').fill('Curry Trays');
    await page.locator('#quantity').fill('20 trays');

    await pickFutureDateTime(page, /pick expiry date & time/i, '14');
    await pickFutureDateTime(page, /start time/i, '10');
    await pickFutureDateTime(page, /end time/i, '12');

    const addressInput = page.locator('#address');
    await addressInput.fill('Connaught Place');
    const suggestion = page.locator('ul li', { hasText: 'Connaught Place' }).first();
    await suggestion.waitFor({ state: 'visible', timeout: 10_000 });
    await suggestion.click();

    await page.getByRole('button', { name: /next: review/i }).click();
    await expect(page.getByRole('heading', { name: /review your donation/i })).toBeVisible({ timeout: 5_000 });

    // First attempt times out; photo must NOT be deleted
    await page.getByRole('button', { name: /confirm & publish/i }).click();
    await expect(page.getByRole('button', { name: /confirm & publish/i })).toBeEnabled({ timeout: 10_000 });
    expect(deleteCalls).toBe(0);

    // Retry: lookup sees no row, retries same insert -> 23505 -> read-back confirms row -> success!
    await page.getByRole('button', { name: /confirm & publish/i }).click();
    await expect(page.getByText(/listing published!/i)).toBeVisible({ timeout: 10_000 });
    expect(uploadCalls).toBe(1);
    expect(deleteCalls).toBe(0);
  });

  test('donor profile with zero latitude and zero longitude is treated as valid location', async ({ page }) => {
    await page.route('**/rest/v1/profiles*', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: { location_lat: 0, location_lng: 0 },
    }));
    await page.goto('/donate');
    await expect(page.locator('.leaflet-marker-icon')).toBeVisible({ timeout: 10_000 });
  });

  test('receiver profile coordinates allow 0 on either axis independently and reject missing coordinate', async ({ page }) => {
    await loginAs(page, 'receiver');

    let currentProfile = { location_lat: 0 as number | null, location_lng: 77.5 as number | null };
    await page.route('**/rest/v1/profiles*', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: currentProfile,
    }));
    await page.route('**/rest/v1/food_listings*', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: [{
        id: '11111111-1111-4111-8111-111111111111',
        title: 'Equatorial Surplus Meals',
        food_category: 'cooked_meal',
        quantity_description: '10 meals',
        status: 'active',
        expiry_time: new Date(Date.now() + 3600_000).toISOString(),
        pickup_window: '10:00 - 11:00',
        location_name: 'Equator Kitchen',
        pickup_lat: 0,
        pickup_lng: 0,
        donor_id: '22222222-2222-4222-8222-222222222222',
        created_at: new Date().toISOString(),
      }],
    }));
    await page.route('**/rest/v1/food_requests*', async (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({ status: 200, contentType: 'application/json', json: null });
      }
      if (route.request().method() === 'POST') {
        return route.fulfill({ status: 201, contentType: 'application/json', json: [{ id: 'req-1' }] });
      }
      return route.continue();
    });

    await page.goto('/browse');
    const requestBtn = page.getByRole('button', { name: /request/i }).first();
    await requestBtn.waitFor({ state: 'visible', timeout: 10_000 });

    // Axis 1: lat = 0, lng = 77.5 -> valid
    await requestBtn.click();
    await page.getByRole('button', { name: /yes, request food/i }).click();
    await expect(page.getByText(/set your location before requesting food/i)).toHaveCount(0);

    // Axis 2: lat = 12.9, lng = 0 -> valid
    currentProfile = { location_lat: 12.9, location_lng: 0 };
    await page.reload();
    await page.getByRole('button', { name: /request/i }).first().click();
    await page.getByRole('button', { name: /yes, request food/i }).click();
    await expect(page.getByText(/set your location before requesting food/i)).toHaveCount(0);

    // Missing coordinate: lat = 0, lng = null -> rejected
    currentProfile = { location_lat: 0, location_lng: null };
    await page.reload();
    await page.getByRole('button', { name: /request/i }).first().click();
    await page.getByRole('button', { name: /yes, request food/i }).click();
    await expect(page.getByText(/set your location before requesting food/i)).toBeVisible({ timeout: 5_000 });
  });
});
