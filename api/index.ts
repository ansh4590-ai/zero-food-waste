// Vercel deploys this file as a single Function (see the "rewrites" in
// vercel.json, which send all /api/* traffic here). Express does its own
// internal routing for the individual /api/... paths from there — this
// file just re-exports the already-built app from server.ts.
import app from "../server";

export default app;
