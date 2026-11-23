# Zero Food Waste

Donors list surplus food, receivers request it, and volunteers verify handoffs by QR code. Supabase provides authentication, Postgres, Realtime and Storage. The Express API handles Gemini, verification providers and scheduled cleanup.

## Run locally

Use Node.js 24 or later. Run these commands from the repository root.

```sh
npm ci
cp .env.example .env.local
```

On Windows PowerShell, use `Copy-Item .env.example .env.local`. Fill in the Supabase settings below, then run `npm run dev` and open `http://localhost:3000`. Leave `NODE_ENV` unset for development. The production start command sets it automatically.

## Environment settings

| Setting | Used for |
| --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Required at build time and by the API. Use the project URL and **publishable/anon** key. Vite embeds these values in the browser bundle. |
| `SUPABASE_SERVICE_ROLE_KEY` | Required server-side for authenticated API operations. Use the secret/service-role key from the same project. |
| `APP_URL` | Deployed frontend origin, including HTTPS. Used for CORS and tile-provider identification. |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Server-side Gemini access and optional model override. Classification and chat require the key in production. The default model is `gemini-2.5-flash`. |
| `GOOGLE_CREDENTIALS_JSON` | Optional base64-encoded service-account JSON for Vision OCR. Locally, `GOOGLE_APPLICATION_CREDENTIALS` can point to a file outside the checkout. |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` | Optional Rekognition face matching. Region defaults to `ap-south-1`. All KYC submissions require administrator review, including when either provider is unavailable. |
| `CRON_SECRET` | Server-side secret shared with the stale-task scheduler. |
| `ADMIN_REGISTRATION_ENABLED`, `ADMIN_SECRET_KEY` | Admin onboarding is disabled by default. The enabled endpoint requires the secret. |
| `OSM_CONTACT` | Optional service contact email or URL included in the tile User-Agent. Defaults to this repository's issues URL. |
| `PORT` | Standalone server port. Defaults to 3000. |
| `VITE_API_BASE_URL` | Optional API prefix for routes that use it. Keep the default `/api` for this same-origin deployment. |

Only publishable settings belong in variables beginning with `VITE_`. The production Content Security Policy permits standard `*.supabase.co` endpoints. If using a custom Supabase domain, add its HTTPS and WSS origins to `connect-src` in `vercel.json`.

## Supabase setup

Enable **pg_cron** in the project's database extensions before running migrations. Postgres schedules listing expiry and stale-request cleanup. GitHub Actions calls the stale **task** endpoint.

With the Supabase CLI installed and authenticated, run from the repository root:

```sh
supabase link --project-ref YOUR_PROJECT_REF
supabase migration list
supabase db push --dry-run
supabase db push
```

For an existing project, compare the recorded migrations with the files before pushing. If migrations were run manually, reconcile their recorded versions first. The deployment prerequisites migration adds the shared AI quota and creates the public listing-photo bucket for new installations. If `food_images` already exists, confirm it is intended for public listing photos and check its upload policies. Identity documents and task proofs belong in their separate private buckets.

## Deployment and verification

1. Import the repository into Vercel with the project root as the root directory. The checked-in configuration builds Vite, serves `dist` and routes `/api/*` to Express. Set the environment variables for each intended environment, then build.
2. Set the Supabase Auth Site URL and permitted redirect URLs for the deployed domain.
3. Set `APP_URL` and `CRON_SECRET` in GitHub Actions repository secrets. The cleanup workflow requests a run every ten minutes and supports a manual run. Scheduled execution can be delayed.
4. Verify that `/api/health` returns HTTP 200, then exercise login, a photo donation, KYC review and a real phone QR scan with test accounts. Health checks confirm the process is running. They do not probe provider credentials.

```sh
npm run lint
npm run build
npm audit
npx playwright install chromium
npm run test:e2e
```

`npm run lint` runs the TypeScript checker. Both browser projects run UI tests with development fixtures. Set `TEST_DONOR_EMAIL` and `TEST_DONOR_PASSWORD` for the optional live login test against a dedicated test project. For a standalone production server, build before running `npm start`.

The interface uses QR codes for handoffs. The authenticated photo-proof API remains available to existing integrations and accepts images up to 3 MiB before base64 encoding. The account limit for chat and classification is shared across instances. IP and tile limits apply per running instance.
