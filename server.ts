import express from "express";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import dotenv from "dotenv";
import crypto from "crypto";
import { evaluateSpoilageRisk } from "./server/spoilage.js";
import { handleTaskProofUpload } from "./server/proofUpload.js";
import { RekognitionClient, CompareFacesCommand } from "@aws-sdk/client-rekognition";
import vision from "@google-cloud/vision";
import cors from "cors";
import compression from "compression";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { aiPrompts } from "./server/aiPrompts.js";
import { productionHeaders } from "./server/productionHeaders.ts";
// `vite` is intentionally NOT imported here at the top level — it's a
// dev-only tool, imported dynamically further down inside the
// `!process.env.VERCEL` branch instead. A static top-level import here
// would get bundled into the Vercel Function even though it's never used
// there, which at best bloats the function and at worst fails to bundle.

dotenv.config({ path: [".env.local", ".env"] });

// ─── PROCESS CRASH HANDLERS ──────────────────────────────────────────────────
// Prevent the entire server from dying on unhandled errors.
// In production, use pm2 or similar to auto-restart on exit.
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err);
  // Give logger time to flush, then exit (pm2 will restart)
  setTimeout(() => process.exit(1), 1000);
});

process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled rejection:', reason);
});

if (process.env.NODE_ENV !== "production") {
  console.log("GOOGLE_APPLICATION_CREDENTIALS:", process.env.GOOGLE_APPLICATION_CREDENTIALS);
}

// NOTE: this used to be wrapped in `async function startServer() { ... }`,
// invoked once at the bottom via `startServer()`. Flattened to module scope
// so `app` can be exported directly — Vercel imports this module and uses
// the exported `app` (see the export further down), it never calls a start
// function. Indentation below is left as-is from the old function body to
// keep this diff reviewable; run a formatter whenever it's convenient.
const app = express();
app.set('trust proxy', 1); // Fixes express-rate-limit behind Vercel reverse proxy
// Vercel doesn't use this at all — it invokes the exported app directly,
// no port involved. Only matters for local dev / a non-Vercel host.
const PORT = parseInt(process.env.PORT || '3000', 10);

  // ─── SECURITY & PERFORMANCE MIDDLEWARE ─────────────────────────────────────
  // CORS: restrict to known origins in production
  const allowedOrigins = new Set([
    process.env.APP_URL?.replace(/\/$/, ""),
    process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`,
    process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`,
    ...(process.env.NODE_ENV === "production" ? [] : [`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`]),
  ].filter(Boolean));
  app.use(cors({
    origin: (origin, callback) => callback(null, !origin || allowedOrigins.has(origin)),
    credentials: true,
  }));

  app.use(helmet({ contentSecurityPolicy: false }));
  const headers = productionHeaders(process.env.VITE_SUPABASE_URL);
  app.use((_req, res, next) => {
    if (process.env.NODE_ENV === "production") {
      for (const { key, value } of headers) res.setHeader(key, value);
    }
    next();
  });

  // Gzip/Brotli compression for all responses
  app.use(compression());

  // Only image endpoints need space for 3 MiB of base64-encoded image data.
  app.use(["/api/classify", "/api/tasks/:taskId/upload-proof"], express.json({ limit: "4200kb" }));
  app.use(express.json({ limit: "64kb" }));

  // ─── RATE LIMITERS ─────────────────────────────────────────────────────────
  const aiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many AI requests. Please wait 60 seconds.' },
  });

  // Database-backed quota shared by chat and classification across function instances.
  const aiAccountLimiter = async (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
    try {
      const { data, error } = await supabaseAdmin.rpc("consume_ai_quota", { p_user_id: req.user!.id });
      if (error) throw error;
      if (data !== true) {
        res.setHeader("Retry-After", "60");
        return res.status(429).json({ error: "AI request limit reached. Try again in a minute." });
      }
      next();
    } catch {
      return res.status(503).json({ error: "AI service temporarily unavailable." });
    }
  };

  const kycLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 3,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many KYC requests. Please wait 60 seconds.' },
  });

  const adminRegisterLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many admin registration attempts. Try again later.' },
  });

  // ─── HEALTH CHECK ──────────────────────────────────────────────────────────
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: Date.now(),
      memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    });
  });

  // ─── PLACES API PROXY — REMOVED (H-10) ───────────────────────────────────
  // The Google Places proxy was removed because the frontend now uses Photon
  // (OpenStreetMap geocoder via useAddressAutocomplete.ts), which calls
  // https://photon.komoot.io directly. The VITE_GOOGLE_MAPS_API_KEY and these
  // two routes are no longer needed. If Google Places is reintroduced for
  // a specific feature, re-add it then with appropriate billing controls.

  // ─── OFFICIAL OPENSTREETMAP TILE PROXY ──────────────────────────────────────
  // Serves official OpenStreetMap tiles with compliant User-Agent and caching.
  // Policy compliance:
  //   • Identifies application via User-Agent + Referer
  //   • Respects upstream Cache-Control / Expires / ETag / Last-Modified headers
  //   • Falls back to 7-day TTL when upstream provides no caching signals
  //   • Never prefetches or bulk-downloads tiles
  //   • Passes ETag and Last-Modified to downstream browsers for conditional GETs
  //
  // In-process cache (M-01 documented limitation):
  //   This LRU cache resets on each serverless cold-start (Vercel).  For
  //   multi-instance deployments, replace with a shared Redis or CDN layer.
  //   The Cache-Control headers forwarded to the browser ensure the browser's
  //   own cache (and any CDN edge in front of Vercel) will honour tile lifetimes.

  const TILE_FALLBACK_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
  const TILE_CACHE_MAX_ENTRIES = 3000;

  interface TileCacheEntry {
    buffer: Buffer;
    contentType: string;
    expiresAt: number;       // local wall-clock expiry
    etag?: string;           // forwarded to browser
    lastModified?: string;   // forwarded to browser
    cacheControl?: string;   // upstream value, forwarded to browser
  }
  const tileCache = new Map<string, TileCacheEntry>();

  /** Parse upstream headers into a local TTL (ms). Returns fallback when no hint present. */
  function parseTileTtlMs(headers: Headers): number {
    // 1. Cache-Control: max-age=N
    const cc = headers.get('cache-control');
    if (cc) {
      const match = cc.match(/max-age=(\d+)/);
      if (match) return parseInt(match[1], 10) * 1000;
    }
    // 2. Expires header
    const exp = headers.get('expires');
    if (exp) {
      const ms = new Date(exp).getTime() - Date.now();
      if (ms > 0) return ms;
    }
    // 3. No signal — 7-day fallback
    return TILE_FALLBACK_TTL_MS;
  }

  const tileLimiter = rateLimit({ windowMs: 60_000, limit: 240, standardHeaders: true, legacyHeaders: false });
  const tileAppUrl = process.env.APP_URL || "https://github.com/ansh4590-ai/zero-food-waste";
  const tileContact = process.env.OSM_CONTACT || "https://github.com/ansh4590-ai/zero-food-waste/issues";
  app.get('/api/tiles/osm/:z/:x/:y.png', tileLimiter, async (req, res) => {
    const { z, x, y } = req.params;

    // Basic input validation — z/x/y must be numeric
    if (![z, x, y].every(value => /^(0|[1-9]\d{0,6})$/.test(value)) ||
        Number(z) > 19 || Number(x) >= 2 ** Number(z) || Number(y) >= 2 ** Number(z)) {
      return res.status(400).send('Invalid tile coordinates');
    }

    const cacheKey = `${z}/${x}/${y}`;

    // ── Serve from in-process cache ──────────────────────────────────────────
    const cached = tileCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      res.setHeader('Content-Type', cached.contentType);
      if (cached.etag) res.setHeader('ETag', cached.etag);
      if (cached.lastModified) res.setHeader('Last-Modified', cached.lastModified);
      // Forward the upstream Cache-Control so browsers and CDN edges cache correctly
      res.setHeader('Cache-Control', cached.cacheControl || `public, max-age=${Math.floor(TILE_FALLBACK_TTL_MS / 1000)}`);
      return res.send(cached.buffer);
    }

    // ── Fetch from OSM ───────────────────────────────────────────────────────
    try {
      const osmUrl = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
      const response = await fetch(osmUrl, {
        signal: AbortSignal.timeout(8000),
        headers: {
          'User-Agent': `ZeroFoodWastePlatform/1.0 (${tileAppUrl}; contact: ${tileContact})`,
          'Referer': tileAppUrl,
        },
      });

      if (!response.ok) {
        return res.status(response.status).send('Tile fetch failed');
      }

      const contentType  = response.headers.get('content-type')   || 'image/png';
      const etag         = response.headers.get('etag')           ?? undefined;
      const lastModified = response.headers.get('last-modified')  ?? undefined;
      const cacheControl = response.headers.get('cache-control')  ?? undefined;
      const ttlMs        = parseTileTtlMs(response.headers);

      const arrayBuffer = await response.arrayBuffer();
      const buffer      = Buffer.from(arrayBuffer);

      // ── Evict oldest entry when at capacity (simple LRU-evict) ──────────
      if (tileCache.size >= TILE_CACHE_MAX_ENTRIES) {
        const firstKey = tileCache.keys().next().value;
        if (firstKey) tileCache.delete(firstKey);
      }

      tileCache.set(cacheKey, {
        buffer,
        contentType,
        expiresAt: Date.now() + ttlMs,
        etag,
        lastModified,
        cacheControl,
      });

      // ── Forward upstream caching signals to the browser / CDN ──────────
      res.setHeader('Content-Type', contentType);
      if (etag) res.setHeader('ETag', etag);
      if (lastModified) res.setHeader('Last-Modified', lastModified);
      res.setHeader('Cache-Control', cacheControl || `public, max-age=${Math.floor(ttlMs / 1000)}`);
      res.send(buffer);
    } catch (err) {
      console.error('[osm/tile]', err);
      res.status(500).send('Failed to fetch OSM tile');
    }
  });

  // Supabase Admin Client
  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );

  interface AuthenticatedRequest extends express.Request {
    user?: { id: string; email?: string; role?: string };
    token?: string;
  }

  // User-scoped Supabase client that carries the caller's JWT bearer token.
  // Required so that PostgreSQL SECURITY DEFINER RPCs (like generate_qr_token and
  // verify_qr_token) can reliably read auth.uid() and auth.role() = 'authenticated'.
  const getUserSupabaseClient = (jwt: string) => {
    return createClient(
      process.env.VITE_SUPABASE_URL || "",
      process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "",
      {
        global: {
          headers: {
            Authorization: `Bearer ${jwt}`,
          },
        },
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
  };

  // ─── AUTH MIDDLEWARE ───────────────────────────────────────────────────────
  // Extracts user identity from Supabase JWT. Sets req.user from the
  // authoritative database profile (not user_metadata which the client can supply).
  // H-03: role is loaded from public.profiles, not from user_metadata.
  const extractUser = async (req: AuthenticatedRequest, _res: express.Response, next: express.NextFunction) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) return next();
      const jwt = authHeader.slice(7);
      req.token = jwt;
      const { data: { user }, error } = await supabaseAdmin.auth.getUser(jwt);
      if (!error && user) {
        // Load role from the authoritative profiles table, not from JWT metadata
        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();
        req.user = { id: user.id, email: user.email, role: profile?.role ?? undefined };
      }
    } catch {
      // Non-blocking — unauthenticated requests just proceed without req.user
    }
    next();
  };

  // Blocking version: returns 401 if no valid user
  const requireAuth = async (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
    await extractUser(req, res, () => {});
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    next();
  };

  // Initialize Gemini safely
  const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

  // 11. Food Image Classifier (Authenticated with both IP & Account rate limiting)
  app.post("/api/classify", requireAuth, aiLimiter, aiAccountLimiter, async (req: AuthenticatedRequest, res) => {
    try {
      const { imageBase64 } = req.body;
      if (typeof imageBase64 !== "string" || !imageBase64) return res.status(400).json({ error: "imageBase64 is required" });

      // ─── MIME + SIZE VALIDATION ────────────────────────────────────────
      if (!imageBase64.startsWith('data:')) {
        return res.status(400).json({ error: "Image must be provided as a data URI." });
      }
      const mimeMatch = imageBase64.match(/^data:(image\/(jpeg|png|webp|gif));base64,/);
      if (!mimeMatch) {
        return res.status(400).json({ error: "Invalid image format. Only JPEG, PNG, and WebP are accepted." });
      }
      // Estimate raw size from base64 length (~75% of base64 length)
      const rawBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
      const estimatedBytes = (rawBase64.length * 3) / 4;
      // 3MB raw ≈ 4MB once base64-encoded, staying under Vercel's ~4.5MB
      // request-body cap.
      const MAX_SIZE_BYTES = 3 * 1024 * 1024;
      if (estimatedBytes > MAX_SIZE_BYTES) {
        return res.status(400).json({ error: "Image too large. Please upload an image under 3MB." });
      }

      // If no API key is provided, return 503 in production or mock in dev
      if (!ai) {
        if (process.env.NODE_ENV === "production") {
          return res.status(503).json({ error: "AI classification service unavailable: GEMINI_API_KEY is not configured." });
        }
        console.warn("No GEMINI_API_KEY provided. Falling back to mock classification in development.");
        return res.json({
          is_food: true,
          title: "Aloo Sabji with Puri",
          detected_items: ["aloo sabji", "puri", "green chutney"],
          predicted_category: "Cooked Meals",
          quantity_description: "3 servings",
          confidence_score: 95,
          freshness_score: 90,
          quality_status: "good",
          estimated_safe_hours: 6,
          spoilage_risk: "medium",
          priority_score: 85,
          packaged_food: false,
          brand_name: null,
          expiry_visible: null,
          notes: "Mock data fallback for development"
        });
      }

      // Reuse mimeMatch from validation above to get the correct MIME type
      const detectedMime = (mimeMatch?.[1] || "image/jpeg") as "image/jpeg" | "image/png" | "image/webp";
      const base64Data = imageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "");

      const elitePrompt = `You are a world-class food recognition AI. Analyze the uploaded image carefully and identify the food accurately regardless of cuisine (Indian, Italian, Chinese, Mexican, etc.).

If the image does NOT contain food, return ONLY this JSON:
{"is_food": false, "reason": "No food detected in the image"}

If food IS detected, identify it accurately. Examples of what to detect:
- Indian: roti, dal, biryani, paneer curry, idli, dosa, samosa, khichdi, chole, rajma
- International: spaghetti, pasta, pizza, burger, sandwich, sushi, noodles, fried rice, soup
- General: fruits, vegetables, salad, bread, desserts, packaged food

Return ONLY valid JSON with no markdown or extra text:
{
  "is_food": true,
  "food_name": "<accurate name of the dish, e.g. Spaghetti Marinara>",
  "quantity": "<estimated servings>",
  "freshness_score": <0-100>,
  "safe_hours": <estimated hours food is safe to eat>,
  "veg/nonveg": "<veg or nonveg>",
  "confidence": <0-100>,
  "predicted_category": "<one of: Cooked Meals, Fresh Produce, Bakery, Packaged Food, Beverages, Other>",
  "spoilage_risk": "<low, medium, high, or critical>",
  "priority_score": <0-100>,
  "quality_status": "<excellent, good, usable, or risky>"
}`;

      const response = await ai.models.generateContent({
        model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
        contents: [
          {
            role: "user",
            parts: [
              { text: elitePrompt },
              { inlineData: { data: base64Data, mimeType: detectedMime } }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json",
        }
      });

      const cleanedText = (response.text || "{}").replace(/```json\n?|```\n?/g, "").trim();
      const rawResult = JSON.parse(cleanedText);

      // Handle non-food images gracefully
      if (rawResult.is_food === false) {
        return res.json({ is_food: false, reason: rawResult.reason || "No food detected in the image" });
      }
      
      if (rawResult.is_food !== true) throw new Error("Missing classification");

      const categoryMap: Record<string, string> = {
        "Cooked Meals": "cooked_meal",
        "Fresh Produce": "raw_produce",
        "Bakery": "bakery",
        "Packaged Food": "packaged_food",
        "Beverages": "beverages",
        "Other": "other"
      };

      const rawCategory = rawResult.predicted_category || "Cooked Meals";
      const mappedCategory = categoryMap[rawCategory] || "cooked_meal";

      // Map to legacy frontend keys while preserving new keys
      const finalResult = {
        ...rawResult,                    // spread raw result FIRST
        is_food: true,
        title: rawResult.food_name || "Food Item",
        quantity_description: rawResult.quantity || "1 serving",
        estimated_safe_hours: rawResult.safe_hours ?? null,
        confidence_score: rawResult.confidence ?? null,
        freshness_score: rawResult.freshness_score ?? null,
        predicted_category: mappedCategory,   // overwrites raw
        spoilage_risk: rawResult.spoilage_risk ?? null,
        priority_score: rawResult.priority_score ?? null,
        quality_status: rawResult.quality_status ?? null,
        is_veg: rawResult["veg/nonveg"] === "veg",
      };

      res.json(finalResult);
    } catch (error: unknown) {
      console.error("[classify] Food classification unavailable.");
      return res.status(503).json({ error: "Food classification unavailable. Enter the details manually or try again." });
    }
  });

  // 12. Spoilage Risk Predictor
  app.post("/api/predict-spoilage", requireAuth, (req, res) => {
    const result = evaluateSpoilageRisk(req.body);
    return res.status(result.status).json(result.body);
  });

  // 13. Fraud & Anomaly Detection
  app.post("/api/detect-anomaly", requireAuth, (req, res) => {
    const { donorId, foodType, quantity, listingFrequency, locationHistory } = req.body;
    
    let is_anomaly = false;
    let anomaly_score = 0.1;
    let reason = "Normal activity";

    // Heuristic anomaly detection
    if (quantity > 1000) {
      is_anomaly = true;
      anomaly_score = 0.85;
      reason = "Unusually large quantity for a single donation.";
    } else if (listingFrequency > 10) { // e.g., > 10 listings per day
      is_anomaly = true;
      anomaly_score = 0.75;
      reason = "High frequency of listings detected from this donor.";
    }

    res.json({ is_anomaly, anomaly_score, reason, method: "heuristic_rule_based" });
  });

  // 14. Demand Prediction
  app.post("/api/predict-demand", requireAuth, (req, res) => {
    if (process.env.NODE_ENV === "production") {
      return res.status(503).json({
        error: "Demand prediction ML model is not yet configured for production."
      });
    }

    const { latMin, latMax, lngMin, lngMax } = req.body;
    
    // Mock time-series prediction based on bounding box
    const predicted_meals = Math.floor(Math.random() * 500) + 100;
    
    res.json({
      predicted_meals_needed_24h: predicted_meals,
      top_3_food_types: ["cooked_meal", "raw_produce", "packaged_food"],
      confidence_level: 0.82,
      is_simulation: true
    });
  });

  // 15. Route Optimizer (Nearest Neighbor TSP)
  app.post("/api/optimize-route", requireAuth, (req, res) => {
    const { startLocation, stops } = req.body;
    
    if (!startLocation || !stops || !Array.isArray(stops)) {
      return res.status(400).json({ error: "Invalid input" });
    }

    // Haversine distance function
    const getDistance = (p1: { lat: number; lng: number }, p2: { lat: number; lng: number }) => {
      const R = 6371; // Radius of the earth in km
      const dLat = (p2.lat - p1.lat) * (Math.PI / 180);
      const dLon = (p2.lng - p1.lng) * (Math.PI / 180);
      const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(p1.lat * (Math.PI / 180)) * Math.cos(p2.lat * (Math.PI / 180)) * 
        Math.sin(dLon/2) * Math.sin(dLon/2); 
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
      return R * c; // Distance in km
    };

    let unvisited = [...stops];
    let currentLocation = startLocation;
    let optimizedOrder = [];
    let totalDistance = 0;

    while (unvisited.length > 0) {
      let nearestIdx = 0;
      let minDistance = Infinity;

      for (let i = 0; i < unvisited.length; i++) {
        const dist = getDistance(currentLocation, unvisited[i]);
        if (dist < minDistance) {
          minDistance = dist;
          nearestIdx = i;
        }
      }

      const nextStop = unvisited.splice(nearestIdx, 1)[0];
      optimizedOrder.push(nextStop);
      totalDistance += minDistance;
      currentLocation = nextStop;
    }

    // Assuming average speed of 30 km/h in city
    const estimatedTimeMinutes = Math.round((totalDistance / 30) * 60) + (stops.length * 10); // 10 mins per stop

    res.json({
      optimized_visit_order: optimizedOrder,
      total_estimated_distance_km: parseFloat(totalDistance.toFixed(2)),
      estimated_total_time_minutes: estimatedTimeMinutes
    });
  });

  // AI Clients for KYC
  // True only when real AWS creds are present — right now .env has neither,
  // so this is false and runRealKyc() below skips straight to manual_review
  // instead of calling Rekognition with "dummy"/"dummy" (which was throwing,
  // getting caught, and quietly returning similarity 0 — indistinguishable
  // from "checked it, faces don't match", which then auto-rejected every
  // real submission since faceScore < 40). Set AWS_ACCESS_KEY_ID /
  // AWS_SECRET_ACCESS_KEY (and AWS_REGION if not ap-south-1) once you have
  // real credentials, and this switches itself back on — no other change needed.
  const AWS_CONFIGURED = Boolean(
    (process.env.AWS_ACCESS_KEY_ID || process.env.AWS_KEY) &&
    (process.env.AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET)
  );
  const rekognitionClient = new RekognitionClient({
    region: process.env.AWS_REGION || "ap-south-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || process.env.AWS_KEY || "dummy",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET || "dummy",
    },
  });
  
  function createVisionClient() {
    try {
      const encoded = process.env.GOOGLE_CREDENTIALS_JSON;
      if (!encoded) return new vision.ImageAnnotatorClient();
      const credentials = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
      if (!credentials?.client_email || !credentials.private_key) throw new Error();
      return new vision.ImageAnnotatorClient({ credentials });
    } catch {
      console.error("Vision credentials could not be loaded. KYC submissions require manual review.");
      return null;
    }
  }
  const visionClient = createVisionClient();

  const compareFaces = async (
    sourceImage: Buffer,
    targetImage: Buffer
  ): Promise<{ similarity: number | null; error?: string }> => {
    try {
      const command = new CompareFacesCommand({
        SourceImage: { Bytes: sourceImage },
        TargetImage: { Bytes: targetImage },
        SimilarityThreshold: 50,
      });
      const response = await rekognitionClient.send(command);
      const similarity = response.FaceMatches?.[0]?.Similarity ?? null;
      return { similarity };
    } catch (e: unknown) {
      console.error("AWS Rekognition error:", e);
      return { similarity: null, error: (e as Error)?.message || "Rekognition request failed" };
    }
  };

  const extractText = async (
    imageBuffer: Buffer
  ): Promise<{ text: string; error?: string }> => {
    try {
      if (!visionClient) return { text: "", error: "OCR unavailable" };
      const [result] = await visionClient.textDetection(imageBuffer);
      return { text: result.fullTextAnnotation?.text || "" };
    } catch (e: unknown) {
      console.error("Google Vision error:", e);
      return { text: "", error: (e as Error)?.message || "Vision API request failed" };
    }
  };

  const parseAadhaar = (text: string) => {
    const aadhaarNumber = text.match(/\d{4}\s?\d{4}\s?\d{4}/);
    const nameMatch = text.match(/(?:Name|नाम)[:\s]*([A-Z][A-Za-z\s]+)/i) || text.match(/^([A-Z][A-Z\s]{3,30})$/m);
    
    const extractedAadhaar = aadhaarNumber?.[0]?.replace(/\s/g, " ") || null;
    const extractedName = nameMatch?.[1]?.trim() || null;

    
    return {
      aadhaar: extractedAadhaar,
      name: extractedName,
    };
  };

  const runRealKyc = async (aadhaarBuffer: Buffer, selfieBuffer: Buffer) => {
    if (aadhaarBuffer.length === 0 || selfieBuffer.length === 0 || aadhaarBuffer.equals(selfieBuffer)) {
      return {
        kyc_score: null,
        face_match_score: null,
        extracted_data: { aadhaar: null, name: null },
        auto_status: "manual_review",
        note: "Separate, readable identity and selfie photos are required.",
      };
    }

    // 1. AWS Credentials Missing -> Manual Review (no fake 0 score)
    if (!AWS_CONFIGURED) {
      const ocrResult = await extractText(aadhaarBuffer);
      const parsed = parseAadhaar(ocrResult.text);
      return {
        kyc_score: null,
        face_match_score: null,
        extracted_data: parsed,
        auto_status: "manual_review",
        note: "Face match skipped: AWS Rekognition is not configured on the server.",
      };
    }

    // 2. Both providers configured: execute concurrently
    const [faceResult, ocrResult] = await Promise.all([
      compareFaces(aadhaarBuffer, selfieBuffer),
      extractText(aadhaarBuffer),
    ]);

    const parsed = parseAadhaar(ocrResult.text);

    // 3. Provider Failures -> Manual Review (never falsely reject due to API timeout/errors)
    if (faceResult.error || ocrResult.error) {
      return {
        kyc_score: null,
        face_match_score: null,
        extracted_data: parsed,
        auto_status: "manual_review",
        note: "A verification provider was unavailable. Queued for manual review.",
      };
    }

    const faceScore = faceResult.similarity;

    // 4. Face match returned null (no face detected or below 50% threshold)
    //    Never assign a numeric score or rejection based on a null face result.
    if (faceScore === null) {
      return {
        kyc_score: null,
        face_match_score: null,
        extracted_data: parsed,
        auto_status: "manual_review",
        note: "Face match below threshold or face not clearly detected; flagged for manual review.",
      };
    }

    // 5. Both providers succeeded cleanly: compute verification score
    let kycScore = 0;
    if (parsed.aadhaar) kycScore += 40;
    if (parsed.name) kycScore += 20;
    if (faceScore > 70) kycScore += 40;
    else if (faceScore > 50) kycScore += 20;

    return {
      kyc_score: Math.min(kycScore, 100),
      face_match_score: faceScore,
      extracted_data: parsed,
      auto_status: "manual_review",
    };
  };

  // UUID format validator
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // 16. KYC AI Endpoint
  app.post("/api/kyc-verify", requireAuth, kycLimiter, async (req: AuthenticatedRequest, res) => {
    try {
      const { aadhaar_path, selfie_path } = req.body;
      if (!aadhaar_path || !selfie_path) {
        return res.status(400).json({ error: "aadhaar_path and selfie_path required" });
      }
      
      const userId = req.user!.id;
      // Exact directory-prefix ownership enforcement
      const expectedPrefix = `verification/${userId}/`;
      const isSafeDocPath = (p: unknown): p is string =>
        typeof p === "string" &&
        p.startsWith(expectedPrefix) &&
        !p.includes("..") &&
        !p.includes("//") &&
        !p.includes("\\");

      if (!isSafeDocPath(aadhaar_path) || !isSafeDocPath(selfie_path)) {
        return res.status(403).json({ error: "Unauthorized access to document paths" });
      }

      // Download from supabase identity_docs storage bucket
      const downloadDocument = async (path: string): Promise<Buffer | null> => {
        try {
          const { data, error } = await supabaseAdmin.storage.from("identity_docs").download(path);
          if (error || !data) {
            console.warn(`Failed to download ${path}:`, error?.message);
            return null;
          }
          const arrayBuffer = await data.arrayBuffer();
          return Buffer.from(arrayBuffer);
        } catch (err) {
          console.error(`Download exception for ${path}:`, err);
          return null;
        }
      };

      const aadhaarBuffer = await downloadDocument(aadhaar_path);
      const selfieBuffer = await downloadDocument(selfie_path);

      if (!aadhaarBuffer || aadhaarBuffer.length === 0 || !selfieBuffer || selfieBuffer.length === 0) {
        return res.status(400).json({
          error: "Could not retrieve uploaded identity documents. Please try uploading again."
        });
      }

      const result = await runRealKyc(aadhaarBuffer, selfieBuffer);

      // Securely persist verified/reviewed score to DB using service-role credentials.
      // If DB write fails, return a controlled error — never return success: true without
      // confirmed persistence to prevent scores being lost silently.
      const { data: saved, error: dbError } = await supabaseAdmin
        .from("profiles")
        .update({
          kyc_score: result.kyc_score,
          face_match_score: result.face_match_score,
          kyc_auto_status: result.auto_status,
          extracted_data: result.extracted_data,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId)
        .eq("verification_status", "pending")
        .eq("documents->>aadhaar", aadhaar_path)
        .eq("documents->>selfie", selfie_path)
        .select("id")
        .maybeSingle();

      if (dbError) {
        console.error("[kyc-verify] Failed to persist KYC result:", dbError);
        return res.status(500).json({
          error: "Verification completed but results could not be saved. Please try again or contact support.",
        });
      }

      if (!saved) return res.status(409).json({ error: "This submission has changed or was already reviewed." });
      res.json({ success: true, ...result });
    } catch (err: unknown) {
      console.error("KYC Processing error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // 17. Secure Admin Register endpoint (H-04)
  // Disabled in production unless ADMIN_REGISTRATION_ENABLED=true is explicitly set.
  // In production without the flag, the route returns 410 Gone to avoid exposing
  // an admin-creation surface to the public internet.
  if (process.env.ADMIN_REGISTRATION_ENABLED === "true") {
    app.post("/api/auth/register-admin", adminRegisterLimiter, async (req, res) => {
      const { fullName, email, password, adminSecret } = req.body;

      const EXPECTED_SECRET = process.env.ADMIN_SECRET_KEY;

      if (!EXPECTED_SECRET || adminSecret !== EXPECTED_SECRET) {
        return res.status(403).json({ error: "Invalid admin secret key" });
      }

      try {
        // Create user using the service_role key, bypassing RLS and trigger restrictions
        const { data, error } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            full_name: fullName,
            role: "admin"
          }
        });

        if (error) {
          return res.status(400).json({ error: (error as Error).message });
        }

        // Force upsert into profiles as admin using service_role.
        // The auth trigger may have already created the row with role='donor';
        // we override it here to 'admin'.
        const { error: upsertError } = await supabaseAdmin.from("profiles").upsert({
          id: data.user.id,
          full_name: fullName,
          role: "admin"
        });

        if (upsertError) {
          // Auth user was created but profile could not be set to admin —
          // roll back the auth user to avoid a dangling account.
          await supabaseAdmin.auth.admin.deleteUser(data.user.id);
          return res.status(500).json({
            error: "Failed to set admin profile. Auth user rolled back.",
            detail: upsertError.message,
          });
        }

        // Double-check the resulting DB profile actually has role = admin
        const { data: profile, error: profileFetchError } = await supabaseAdmin
          .from("profiles")
          .select("role")
          .eq("id", data.user.id)
          .single();

        if (profileFetchError || profile?.role !== "admin") {
          await supabaseAdmin.auth.admin.deleteUser(data.user.id);
          return res.status(500).json({
            error: "Profile role verification failed. Auth user rolled back.",
            detail: profileFetchError?.message ?? `Expected role=admin, got role=${profile?.role}`,
          });
        }

        res.json({
          success: true,
          user: {
            id: data.user.id,
            fullName,
            email,
            role: "admin"
          }
        });
      } catch (err: unknown) {
        console.error("Admin registration error:", err);
        res.status(500).json({ error: "Internal server error" });
      }
    });
  } else {
    // Route is disabled — return 410 Gone so callers know it is intentionally unavailable.
    app.post("/api/auth/register-admin", (_req, res) => {
      res.status(410).json({
        error: "Admin registration is disabled. Contact your system administrator."
      });
    });
  }

  // 17. Auth Login (Mock) — DISABLED in production to prevent privilege escalation
  if (process.env.NODE_ENV !== "production") {
    app.post("/api/auth/login", (req, res) => {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }

      // Mock role detection based on email for demonstration
      let role = "donor"; // Default
      if (email.includes("admin")) role = "admin";
      else if (email.includes("volunteer")) role = "volunteer";
      else if (email.includes("receiver")) role = "receiver";

      // Mock successful login
      res.json({
        success: true,
        user: {
          id: "u_" + Math.random().toString(36).substr(2, 9),
          email,
          role
        },
        token: "mock_jwt_token_" + Date.now()
      });
    });
  }

  // ─── 18. PHOTO PROOF UPLOAD ──────────────────────────────────────────────────
  app.post("/api/tasks/:taskId/upload-proof", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const result = await handleTaskProofUpload({
        supabaseAdmin,
        taskId: req.params.taskId,
        volunteerId: req.user!.id,
        proofType: req.body?.proof_type,
        imageBase64: req.body?.imageBase64,
      });
      res.status(result.status).json(result.body);
    } catch (err: unknown) {
      console.error("Proof upload error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ─── 21. STALE TASK CLEANUP (cron-only — not for public/browser use) ─────────
  // Registered on both GET and POST:
  //  - Invoked via external scheduler (e.g. GitHub Actions cleanup workflow)
  //    with `Authorization: Bearer <CRON_SECRET>` header.
  const cleanupStaleHandler = async (req: express.Request, res: express.Response) => {
    // Accept secret via Authorization: Bearer header ONLY.
    // Query parameters are rejected to avoid leaking secrets in access logs.
    const provided = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    const expected = process.env.CRON_SECRET;
    if (!provided || !expected) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const providedBuf = Buffer.from(provided, "utf8");
    const expectedBuf = Buffer.from(expected, "utf8");
    if (
      providedBuf.byteLength !== expectedBuf.byteLength ||
      !crypto.timingSafeEqual(providedBuf, expectedBuf)
    ) {
      return res.status(403).json({ error: "Forbidden" });
    }
    try {
      const { data, error } = await supabaseAdmin.rpc('auto_expire_stale_tasks');
      if (error) throw error;
      res.json(data);
    } catch (err: unknown) {
      console.error("Stale cleanup error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  };
  app.get("/api/tasks/cleanup-stale", cleanupStaleHandler);
  app.post("/api/tasks/cleanup-stale", cleanupStaleHandler);

  // ─── 22. QR TOKEN GENERATION ────────────────────────────────────────────────
  app.post("/api/tasks/:taskId/generate-qr", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { taskId } = req.params;
      const { type } = req.body; // 'pickup' or 'delivery'

      if (!type || !['pickup', 'delivery'].includes(type)) {
        return res.status(400).json({ error: "type must be 'pickup' or 'delivery'" });
      }

      if (!UUID_REGEX.test(taskId)) {
        return res.status(400).json({ error: "Invalid taskId format" });
      }

      const client = req.token ? getUserSupabaseClient(req.token) : supabaseAdmin;
      const { data, error } = await client.rpc('generate_qr_token', {
        p_task_id: taskId,
        p_type: type,
      });

      if (error) throw error;

      if (data?.success) {
        res.json({
          success: true,
          qrValue: data.token,
          expiresAt: data.expires_at,
        });
      } else {
        res.status(400).json({ success: false, error: data?.error || "Failed to generate QR" });
      }
    } catch (err: unknown) {
      console.error("QR generation error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ─── 23. QR TOKEN VERIFICATION (rate-limited + authenticated) ──────────────
  const qrFailures = new Map<string, { count: number; resetAt: number }>();

  // Periodic cleanup of rate limit map to prevent memory leak
  setInterval(() => {
    const now = Date.now();
    for (const [key, val] of qrFailures.entries()) {
      if (val.resetAt <= now) qrFailures.delete(key);
    }
  }, 60_000);

  app.post("/api/tasks/verify-qr", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { token } = req.body;
      // Use authenticated identity instead of trusting client body
      const volunteerId = req.user!.id;

      if (!token) {
        return res.status(400).json({ error: "token is required" });
      }

      // Normalize token input
      const cleanToken = String(token).trim();

      // Rate limiting: 5 failures per user+IP per 60 seconds
      const ip = req.ip || req.socket.remoteAddress || "unknown";
      const rateLimitKey = `${volunteerId}:${ip}`;
      const now = Date.now();
      const record = qrFailures.get(rateLimitKey);
      if (record && record.resetAt > now && record.count >= 5) {
        return res.status(429).json({
          success: false,
          error: "Too many failed attempts. Please wait 60 seconds.",
        });
      }

      const client = req.token ? getUserSupabaseClient(req.token) : supabaseAdmin;
      const { data, error } = await client.rpc('verify_qr_token', {
        p_token: cleanToken,
        p_volunteer_id: volunteerId,
      });

      if (error) throw error;

      if (data?.success) {
        // Clear rate limit on success
        qrFailures.delete(rateLimitKey);
        res.json({
          success: true,
          newStatus: data.new_status,
          taskId: data.task_id,
          type: data.type,
        });
      } else {
        // Track failure for rate limiting
        const existing = qrFailures.get(rateLimitKey);
        if (existing && existing.resetAt > now) {
          existing.count++;
        } else {
          qrFailures.set(rateLimitKey, { count: 1, resetAt: now + 60_000 });
        }
        res.status(400).json({ success: false, error: data?.error || "Verification failed" });
      }
    } catch (err: unknown) {
      console.error("QR verification error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ─── 24. ABORT VOLUNTEER TASK ──────────────────────────────────────────────────
  app.post("/api/tasks/:taskId/abort", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { taskId } = req.params;
      const { reason } = req.body;
      const volunteerId = req.user!.id;

      if (!UUID_REGEX.test(taskId)) {
        return res.status(400).json({ error: "Invalid taskId format" });
      }

      if (!reason || typeof reason !== "string" || reason.trim() === "") {
        return res.status(400).json({ error: "A cancellation reason is required" });
      }

      const client = req.token ? getUserSupabaseClient(req.token) : supabaseAdmin;
      const { data, error } = await client.rpc("abort_volunteer_task", {
        p_task_id: taskId,
        p_volunteer_id: volunteerId,
        p_reason: reason.trim()
      });

      if (error) throw error;

      if (data?.success) {
        res.json({ success: true, message: data.message });
      } else {
        res.status(400).json({ success: false, error: data?.error || "Failed to abort task" });
      }
    } catch (err: unknown) {
      console.error("Task abort error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ─── 25. GOOGLE GEMINI PROXY ────────────────────────────────────────────────
  // Replaces the local mock LLM with the production Gemini API key already in the project.
  // Adapts OpenAI's format from the frontend to Gemini's native format.
  app.post("/api/llm/chat/completions", requireAuth, aiLimiter, aiAccountLimiter, async (req: AuthenticatedRequest, res) => {
    if (!ai) {
      return res.status(503).json({ error: "Gemini API key not configured on server" });
    }

    try {
      const { messages, feature = "assistant", temperature = 0.7 } = req.body;
      if (typeof feature !== "string" || !Object.hasOwn(aiPrompts, feature) ||
          !Array.isArray(messages) || !messages.length || messages.length > 9 ||
          !Number.isFinite(temperature) || temperature < 0 || temperature > 1) {
        return res.status(400).json({ error: "Invalid chat request." });
      }
      let totalLength = 0;
      const contents = [];
      for (const message of messages) {
        if (!message || !["assistant", "user"].includes(message.role) ||
            typeof message.content !== "string" || !message.content.trim() || message.content.length > 4000) {
          return res.status(400).json({ error: "Invalid chat message." });
        }
        totalLength += message.content.length;
        contents.push({ role: message.role === "user" ? "user" : "model", parts: [{ text: message.content }] });
      }
      if (totalLength > 20_000 || contents.at(-1)?.role !== "user") {
        return res.status(400).json({ error: "Invalid conversation history." });
      }

      // Quick ping bypass for health checks
      if (contents.length === 1 && contents[0].parts[0].text === "ping") {
        return res.json({ choices: [{ message: { content: "pong" } }] });
      }

      const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          temperature,
          systemInstruction: aiPrompts[feature as keyof typeof aiPrompts],
          maxOutputTokens: 4096,
          ...(model === "gemini-2.5-flash" && { thinkingConfig: { thinkingBudget: 512 } }),
        }
      });

      const answer = response.text?.trim();
      if (!answer) {
        return res.status(502).json({ error: "The AI service returned no answer. Please try again." });
      }

      // Return in OpenAI format for the frontend aiService
      res.json({
        choices: [
          {
            message: {
              content: answer
            }
          }
        ]
      });
    } catch (err: unknown) {
      console.error("[Gemini Chat] error:", err);
      res.status(503).json({ error: "AI service unavailable" });
    }
  });

  // ─── EXPORT FOR VERCEL ───────────────────────────────────────────────────
  // Every route above this line is registered on `app` by the time this
  // runs. api/index.ts imports this export and Vercel wraps it as a single
  // Function — Vercel never calls app.listen() or runs anything below.
  export default app;

  // ─── EVERYTHING BELOW ONLY RUNS OUTSIDE VERCEL ──────────────────────────
  // Local dev (`npm run dev`) and any future non-Vercel host (a VPS, Cloud
  // Run, etc.) still get the old behavior: Vite dev middleware, or serving
  // the built dist/ + a port listener. `process.env.VERCEL` is set
  // automatically by Vercel, so none of this runs there — and it would be
  // dead weight if it did, since Vercel ignores express.static() entirely
  // and serves the built frontend through its own static hosting instead
  // (configured via vercel.ts's outputDirectory).
  if (!process.env.VERCEL) {
    (async () => {
      if (process.env.NODE_ENV !== "production") {
        const { createServer: createViteServer } = await import("vite");
        const vite = await createViteServer({
          server: { middlewareMode: true },
          appType: "spa",
        });
        app.use(vite.middlewares);
      } else {
        const distPath = path.join(process.cwd(), 'dist');
        app.use(express.static(distPath));
        app.get('*', (req, res) => {
          res.sendFile(path.join(distPath, 'index.html'));
        });
      }

      const server = app.listen(PORT, "0.0.0.0", () => {
        console.log(`Server running on http://localhost:${PORT}`);
      });

      // ─── GRACEFUL SHUTDOWN ─────────────────────────────────────────────
      const shutdown = (signal: string) => {
        console.log(`\n[${signal}] Shutting down gracefully...`);
        server.close(() => {
          console.log('HTTP server closed.');
          process.exit(0);
        });
        // Force exit after 10s if connections aren't drained
        setTimeout(() => {
          console.error('Forced shutdown after timeout.');
          process.exit(1);
        }, 10_000);
      };
      process.on('SIGTERM', () => shutdown('SIGTERM'));
      process.on('SIGINT', () => shutdown('SIGINT'));
    })();
  }
