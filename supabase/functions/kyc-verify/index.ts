// @ts-nocheck
// supabase/functions/kyc-verify/index.ts
//
// ⚠️  DECOMMISSIONED — Do not deploy.
//
// This Edge Function has been superseded by the Node.js /api/kyc-verify endpoint
// in server.ts, which provides:
//   • Exact directory-prefix path ownership enforcement (verification/{uid}/)
//   • Real Google Cloud Vision OCR via the official Node SDK
//   • Real AWS Rekognition face matching with null-safe error handling
//   • Provider failure → manual_review (never auto-rejection on API error)
//   • Authoritative DB write via supabaseAdmin (service role) with error propagation
//   • 5MB limit + magic-byte image format validation on proof uploads
//
// The frontend Verification.tsx calls POST /api/kyc-verify with the user's JWT.
// All document paths are validated server-side with:
//   const isSafeDocPath = (p) => typeof p === "string"
//     && p.startsWith(`verification/${userId}/`)
//     && !p.includes("..") && !p.includes("//") && !p.includes("\\");
//
// If you ever need a Supabase Edge Function for KYC in future (e.g. for Vercel-less
// deployments), rebuild it from scratch based on server.ts rather than this file.
// This file is kept only for historical reference and must NOT be deployed.

Deno.serve((_req: Request) => {
  return new Response(
    JSON.stringify({
      success: false,
      error: "This Edge Function is decommissioned. Use the Node API endpoint /api/kyc-verify.",
    }),
    { status: 410, headers: { "Content-Type": "application/json" } }
  );
});
