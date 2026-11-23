# Zero Food Waste deployment audit

Reviewed on 23 November 2026 against GitHub main at `9ef4bb2`. The corrected source is on the local `fix/deployment-audit` branch.

## Release decision

The local type check, production build and dependency audit pass. Before release, retire the historical Google Stitch credential, apply the database migration in staging and run a live donor-to-volunteer handoff using the deployed app and a phone. This review used synthetic accounts and separate local services. It did not access production credentials or modify a remote deployment.

## Findings and changes

| Area | Finding and disposition |
| --- | --- |
| Credential history | Commit `25208ec` includes a literal `X-Goog-Api-Key` in the historical Stitch MCP configuration. Its current validity is unknown. Revoke it in the owning account, replace it in any active integration and review usage. The source ZIP excludes Git history. A historical Firebase browser configuration also contains a Google API key. Check its application and API restrictions if that project still exists. |
| Camera and Firebase | The audited revision already allowed same-origin camera access and had removed Firebase auth. Missing Supabase public settings now stop a production build with an actionable error. Profile lookup runs after the Supabase auth callback releases its lock, and late profile responses are discarded after a session change. |
| Donation photos | The existing 1600-pixel JPEG resize remains. The client checks the encoded image's file size before sending it, clears stale classification results when replacing a photo, and preserves zero-valued scores. Missing model scores remain unknown. Classification failures no longer return provider messages or a fabricated food assessment. |
| Gemini | Listing suggestions, text classification, cross-validation, routing and chat use server-owned instructions. Chat accepts bounded user/assistant messages, limits output and shares a ten-request-per-minute database-backed account quota with image classification. The existing IP limiter remains. |
| KYC | Malformed OCR configuration leaves other API routes available. Scores inform human review. New checks cannot approve an account. Identical image bytes go to review without a face score. Score writes match the currently pending document pair. OCR text previews were removed from logs. |
| Maps and headers | The tile proxy validates zoom and tile coordinates, applies an IP limit and times out upstream requests. Its identification uses the deployment URL and configurable contact. Static pages and the standalone production server send a CSP. CORS uses configured origins. |
| Database and Storage | Fresh migrations previously stopped at missing enums, a renamed RPC argument and an ambiguous policy reference. Corrected migration replay and added the pickup/drop-off prerequisites and the listing-photo bucket. Existing installations get the new prerequisites through the November 23 migration. |
| Dependencies and deployment | Updated the lockfile, removed the unused direct animation dependency and replaced the shadcn CLI dependency with the two CSS variants the UI uses. Production start includes its runtime dependencies. Updated setup instructions, removed the unused Supabase test page and made missing scheduler secrets fail the job visibly. The latest migration mentioned in the earlier audit was already dated in the past by the review date. |
| Mobile and integrations | Named the public menu toggle and mobile action region. Navigation tests now operate the mobile drawer and locate the intended footer action. QR remains the handoff UI. The photo-proof endpoint is retained for API integrations, with a 3 MiB raw image limit. |

## Verification

| Check | Result |
| --- | --- |
| Clean installation and TypeScript | `npm ci` and `npm run lint` passed on Node 24. |
| Production build and pages | `npm run build` passed with fixture public settings. A second clean install with development packages omitted passed the production start/health check. The production home and login pages rendered in headless Chromium with no observed CSP violations. |
| Packages | `npm audit` initially reported one high and eight moderate findings. The revised lockfile reported zero known findings. |
| SQL | All 35 migrations replayed on embedded PostgreSQL with local stand-ins for Supabase Auth, Storage and the pg_cron interface. Tested signup, listing creation, request dispatch, account quota exhaustion and renewal. The fixture does not run the hosted scheduler or Storage HTTP service. |
| API | Imported the Vercel entry point in production mode with malformed Vision credentials. Local provider fixtures exercised the health route, headers, authenticated chat ping, quota response and KYC review. |
| Browser | 86 passed across desktop and emulated mobile Chromium, including compression of a generated PNG exceeding 3 MiB through the donation form. Two live donor sign-in cases were skipped because no test account was supplied. An earlier run during edits had two intermittent mobile QR assertions. The final complete run used a fixed source tree with hot reload disabled. Both QR cases also passed three additional mobile runs each. |

## Deployment checks requiring owner access

1. Rotate the historical Stitch key or confirm it has already been revoked.
2. Apply the migrations to the intended Supabase staging project. Confirm the existing `food_images` bucket is public for listing photos only and review any custom policies. Keep identity and proof buckets private.
3. Set the Vercel and GitHub Actions environment values listed in the README. Run the cleanup workflow manually and check its result.
4. On the HTTPS deployment, sign in with real test accounts, donate a photo, review a KYC submission as an admin, and scan the pickup and delivery codes with a phone. Provider billing, live keys, camera hardware, hosted Supabase policy configuration and the deployed Vercel headers were outside the local checks.

[Google API key management](https://docs.cloud.google.com/docs/authentication/api-keys) · [Supabase migration CLI](https://supabase.com/docs/reference/cli/supabase-migration-list) · [Vercel function payload limits](https://vercel.com/docs/errors/function_payload_too_large)
