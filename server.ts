import express from "express";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import dotenv from "dotenv";
import { RekognitionClient, CompareFacesCommand } from "@aws-sdk/client-rekognition";
import vision from "@google-cloud/vision";
import cors from "cors";
import compression from "compression";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
// `vite` is intentionally NOT imported here at the top level — it's a
// dev-only tool, imported dynamically further down inside the
// `!process.env.VERCEL` branch instead. A static top-level import here
// would get bundled into the Vercel Function even though it's never used
// there, which at best bloats the function and at worst fails to bundle.

dotenv.config();

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
  const allowedOrigins = process.env.APP_URL
    ? [process.env.APP_URL, `http://localhost:${PORT}`]
    : [`http://localhost:${PORT}`];
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (server-to-server, curl, mobile apps)
      const isVercelPreview = origin && /^https:\/\/zero-food-waste[a-zA-Z0-9-]*\.vercel\.app$/.test(origin);
      if (!origin || allowedOrigins.includes(origin) || isVercelPreview) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  }));

  // Standard security headers
  // In development, CSP is set permissively to allow Vite HMR, Supabase,
  // Firebase, Google APIs, and any other external services the frontend uses.
  // In production, Helmet's defaults are overridden to allow Supabase + Firebase.
  const supabaseHost = (process.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://maps.googleapis.com"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://maps.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          imgSrc: [
            "'self'",
            "data:",
            "blob:",
            "https:",
            "https://maps.gstatic.com",
            // Official OpenStreetMap tile servers
            "https://tile.openstreetmap.org",
            "https://*.tile.openstreetmap.org",
          ],
          connectSrc: [
            "'self'",
            // Vite HMR (dev only)
            "http://localhost:*",
            "ws://localhost:*",
            // Supabase
            supabaseHost,
            `${supabaseHost}/`,
            "https://*.supabase.co",
            "wss://*.supabase.co",
            // Google APIs (Vision, Gemini)
            "https://*.googleapis.com",
            "https://generativelanguage.googleapis.com",
            // Firebase
            "https://*.firebaseapp.com",
            "https://*.firebase.com",
            "https://*.firebaseio.com",
            "wss://*.firebaseio.com",
            // Google Places REST API
            "https://places.googleapis.com",
            // Open Source Routing Machine (OSRM)
            "https://router.project-osrm.org",
            // Photon OpenStreetMap Geocoding
            "https://photon.komoot.io",
            // OSM Nominatim (reverse geocoding)
            "https://nominatim.openstreetmap.org",
          ],
          frameSrc: ["'none'"],
          objectSrc: ["'none'"],
        },
      },
    })
  );

  // Gzip/Brotli compression for all responses
  app.use(compression());

  // Increase payload limit for base64 images.
  // 5MB images become ~6.6MB when base64 encoded.
  app.use(express.json({ limit: '10mb' }));

  // ─── RATE LIMITERS ─────────────────────────────────────────────────────────
  const aiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many AI requests. Please wait 60 seconds.' },
  });

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

  // ─── PLACES API PROXY ─────────────────────────────────────────────────────
  // We proxy Google Places requests server-side so:
  //  1. The API key never leaves the server
  //  2. No CORS / CSP browser restrictions
  //  3. Works with the classic Places API (no "Places API New" required)
  app.get('/api/places/autocomplete', async (req, res) => {
    const { input } = req.query as { input?: string };
    const apiKey = process.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'Maps API key not configured on server' });
    if (!input || String(input).trim().length < 2) return res.json({ predictions: [] });

    try {
      const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
      url.searchParams.set('input', String(input));
      url.searchParams.set('key', apiKey);
      url.searchParams.set('components', 'country:in');
      url.searchParams.set('language', 'en');

      const r = await fetch(url.toString());
      const data = await r.json() as { predictions?: unknown[]; status?: string; error_message?: string };
      
      // Debug: log what Google actually returned
      console.log(`[places/autocomplete] query="${input}" status=${data.status} predictions=${(data.predictions ?? []).length}${data.error_message ? ` error="${data.error_message}"` : ''}`);
      
      res.json({ predictions: data.predictions ?? [], status: data.status });
    } catch (err) {
      console.error('[places/autocomplete]', err);
      res.status(500).json({ error: 'Places autocomplete failed' });
    }
  });

  app.get('/api/places/geocode', async (req, res) => {
    const { place_id } = req.query as { place_id?: string };
    const apiKey = process.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'Maps API key not configured on server' });
    if (!place_id) return res.status(400).json({ error: 'place_id required' });

    try {
      const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
      url.searchParams.set('place_id', String(place_id));
      url.searchParams.set('key', apiKey);

      const r = await fetch(url.toString());
      const data = await r.json() as { results?: { geometry?: { location?: { lat: number; lng: number } } }[]; status?: string };
      const location = data.results?.[0]?.geometry?.location ?? null;
      res.json({ location, status: data.status });
    } catch (err) {
      console.error('[places/geocode]', err);
      res.status(500).json({ error: 'Geocode failed' });
    }
  });

  // ─── OFFICIAL OPENSTREETMAP TILE PROXY ──────────────────────────────────────
  // Serves official OpenStreetMap tiles with compliant User-Agent and caching.
  // Bypasses the OSM volunteer-server block on localhost browsers while respecting
  // the OSM Tile Usage Policy (aggressively cached, identifies application).
  const tileCache = new Map<string, { buffer: Buffer; contentType: string; expiresAt: number }>();
  const TILE_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

  app.get('/api/tiles/osm/:z/:x/:y.png', async (req, res) => {
    const { z, x, y } = req.params;
    const cacheKey = `${z}/${x}/${y}`;

    const cached = tileCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      res.setHeader('Content-Type', cached.contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
      return res.send(cached.buffer);
    }

    try {
      const osmUrl = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
      const response = await fetch(osmUrl, {
        headers: {
          'User-Agent': 'ZeroFoodWastePlatform/1.0 (contact: admin@zerofoodwaste.org)',
          'Referer': 'https://zerofoodwaste.vercel.app/',
        },
      });

      if (!response.ok) {
        return res.status(response.status).send('Tile fetch failed');
      }

      const contentType = response.headers.get('content-type') || 'image/png';
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (tileCache.size > 3000) {
        const firstKey = tileCache.keys().next().value;
        if (firstKey) tileCache.delete(firstKey);
      }

      tileCache.set(cacheKey, {
        buffer,
        contentType,
        expiresAt: Date.now() + TILE_CACHE_TTL_MS,
      });

      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
      res.send(buffer);
    } catch (err) {
      console.error('[osm/tile]', err);
      res.status(500).send('Failed to fetch OSM tile');
    }
  });

  // Initialize Gemini safely
  const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

  // 11. Food Image Classifier
  app.post("/api/classify", aiLimiter, async (req, res) => {
    try {
      const { imageBase64 } = req.body;
      if (!imageBase64) return res.status(400).json({ error: "imageBase64 is required" });

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

      // If no API key is provided, fall back to a mock response for the demo
      if (!ai) {
        console.warn("No GEMINI_API_KEY provided. Falling back to mock classification.");
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
        model: "gemini-2.5-flash",
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
        estimated_safe_hours: rawResult.safe_hours || 12,
        confidence_score: rawResult.confidence || 80,
        freshness_score: rawResult.freshness_score || 85,
        predicted_category: mappedCategory,   // overwrites raw
        spoilage_risk: rawResult.spoilage_risk || "low",
        priority_score: rawResult.priority_score || 50,
        quality_status: rawResult.quality_status || "good",
        is_veg: rawResult["veg/nonveg"] === "veg",
      };

      res.json(finalResult);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error("[classify] Gemini API error:", errMsg);
      console.error("[classify] Full error:", error);
      return res.status(503).json({
        error: `AI classification failed: ${errMsg}`,
        is_food: true,
        title: "",
        quantity_description: "",
        freshness_score: null,
        estimated_safe_hours: null,
        confidence_score: 0,
        predicted_category: "cooked_meal",
        spoilage_risk: "medium",
        priority_score: 50,
        quality_status: "usable",
      });
    }
  });

  // 12. Spoilage Risk Predictor
  app.post("/api/predict-spoilage", (req, res) => {
    const { food_type, preparation_time, current_temperature_celsius, travel_distance_km, storage_type } = req.body;
    
    let risk = "low";
    let safe_hours = 24;
    let recommendation = "Safe to transport.";

    // Rule-based logic
    if (storage_type === "ambient" && current_temperature_celsius > 25) {
      if (food_type === "cooked_meal") {
        risk = "high";
        safe_hours = 2;
        recommendation = "Immediate refrigeration required. High risk of bacterial growth.";
      } else if (food_type === "raw_produce") {
        risk = "medium";
        safe_hours = 12;
        recommendation = "Keep in a cool, shaded place.";
      }
    } else if (storage_type === "refrigerated") {
      safe_hours = food_type === "cooked_meal" ? 48 : 72;
    }

    if (travel_distance_km > 20 && storage_type === "ambient") {
      risk = risk === "high" ? "high" : "medium";
      recommendation += " Use insulated bags for long travel.";
    }

    res.json({
      spoilage_risk: risk,
      estimated_safe_hours: safe_hours,
      recommendation
    });
  });

  // 13. Fraud & Anomaly Detection
  app.post("/api/detect-anomaly", (req, res) => {
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

    res.json({ is_anomaly, anomaly_score, reason });
  });

  // 14. Demand Prediction
  app.post("/api/predict-demand", (req, res) => {
    const { latMin, latMax, lngMin, lngMax } = req.body;
    
    // Mock time-series prediction based on bounding box
    const predicted_meals = Math.floor(Math.random() * 500) + 100;
    
    res.json({
      predicted_meals_needed_24h: predicted_meals,
      top_3_food_types: ["cooked_meal", "raw_produce", "packaged_food"],
      confidence_level: 0.82
    });
  });

  // 15. Route Optimizer (Nearest Neighbor TSP)
  app.post("/api/optimize-route", (req, res) => {
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
  
  // On Vercel there's no local file to point GOOGLE_APPLICATION_CREDENTIALS at
  // (it's currently an absolute path on your Windows machine, which won't
  // exist there). Set GOOGLE_CREDENTIALS_JSON to the base64 of your whole
  // google-cloud-key.json instead and this decodes it directly — no temp
  // file needed. Locally, GOOGLE_APPLICATION_CREDENTIALS (a real file path)
  // still works exactly as before if you leave GOOGLE_CREDENTIALS_JSON unset.
  const visionClient = process.env.GOOGLE_CREDENTIALS_JSON
    ? new vision.ImageAnnotatorClient({
        credentials: JSON.parse(
          Buffer.from(process.env.GOOGLE_CREDENTIALS_JSON, "base64").toString("utf-8")
        ),
      })
    : new vision.ImageAnnotatorClient();

  const compareFaces = async (sourceImage: Buffer, targetImage: Buffer) => {
    try {
      const command = new CompareFacesCommand({
        SourceImage: { Bytes: sourceImage },
        TargetImage: { Bytes: targetImage },
        SimilarityThreshold: 50,
      });
      const response = await rekognitionClient.send(command);
      return response.FaceMatches?.[0]?.Similarity || 0;
    } catch (e) {
      console.error("AWS Rekognition error:", e);
      return 0; // return 0 when API fails
    }
  };

  const extractText = async (imageBuffer: Buffer) => {
    try {
      const [result] = await visionClient.textDetection(imageBuffer);
      return result.fullTextAnnotation?.text || "";
    } catch (e) {
      console.error("Google Vision error:", e);
      return ""; // empty text if API fails
    }
  };

  const parseAadhaar = (text: string) => {
    const aadhaarNumber = text.match(/\d{4}\s?\d{4}\s?\d{4}/);
    const nameMatch = text.match(/(?:Name|नाम)[:\s]*([A-Z][A-Za-z\s]+)/i) || text.match(/^([A-Z][A-Z\s]{3,30})$/m);
    
    const extractedAadhaar = aadhaarNumber?.[0]?.replace(/\s/g, " ") || null;
    const extractedName = nameMatch?.[1]?.trim() || null;

    if (!extractedAadhaar && !extractedName && text.trim().length > 0) {
      console.warn("Failed to extract Aadhaar or Name from text. Text preview:", text.substring(0, 100).replace(/\n/g, "\\n"));
    }
    
    return {
      aadhaar: extractedAadhaar,
      name: extractedName,
    };
  };

  const runRealKyc = async (aadhaarBuffer: Buffer, selfieBuffer: Buffer) => {
    // Graceful fallback for missing buckets or dummy uploads in demo mode
    if (aadhaarBuffer.length === 0 || selfieBuffer.length === 0) {
      console.error("Empty buffers provided for KYC.");
      return {
        kyc_score: 0,
        face_match_score: 0,
        extracted_data: { aadhaar: null, name: null },
        auto_status: "manual_review",
      };
    }

    // Run OCR either way; only run the paid face-compare call if AWS is
    // actually configured (see AWS_CONFIGURED above).
    const [faceScore, text] = await Promise.all([
      AWS_CONFIGURED ? compareFaces(aadhaarBuffer, selfieBuffer) : Promise.resolve(null),
      extractText(aadhaarBuffer),
    ]);
    const parsed = parseAadhaar(text);

    // AWS not configured: there's no real signal on the face match, so this
    // goes to manual_review rather than being scored (and possibly
    // auto-rejected) as though a check actually ran and failed.
    if (faceScore === null) {
      return {
        kyc_score: null,
        face_match_score: null,
        extracted_data: parsed,
        auto_status: "manual_review",
        note: "Face match skipped: AWS Rekognition is not configured on the server.",
      };
    }

    let kycScore = 0;
    if (parsed.aadhaar) kycScore += 40;
    if (parsed.name) kycScore += 20;
    if (faceScore > 70) kycScore += 40;
    else if (faceScore > 50) kycScore += 20;
  
    let status = "manual_review";
    if (kycScore >= 80 && faceScore > 75) status = "approved";
    if (faceScore < 40) status = "rejected";
  
    return {
      kyc_score: Math.min(kycScore, 100),
      face_match_score: faceScore,
      extracted_data: parsed,
      auto_status: status,
    };
  };

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
  }

  // ─── AUTH MIDDLEWARE ───────────────────────────────────────────────────────
  // Extracts user identity from Supabase JWT. Sets req.user = { id, email, role }.
  // Non-blocking: if no token, req.user is undefined.
  const extractUser = async (req: AuthenticatedRequest, _res: express.Response, next: express.NextFunction) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) return next();
      const jwt = authHeader.slice(7);
      const { data: { user }, error } = await supabaseAdmin.auth.getUser(jwt);
      if (!error && user) {
        req.user = { id: user.id, email: user.email, role: user.user_metadata?.role };
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
      if (!aadhaar_path.includes(userId) || !selfie_path.includes(userId)) {
        return res.status(403).json({ error: "Unauthorized access to document paths" });
      }

      // Download from supabase with graceful failure for demo mode
      const downloadDocument = async (path: string) => {
        const { data, error } = await supabaseAdmin.storage.from("identity_docs").download(path);
        if (error || !data) {
          console.warn(`Failed to download ${path} (${error?.message}). Falling back to empty buffer.`);
          return Buffer.from("");
        }
        const arrayBuffer = await data.arrayBuffer();
        return Buffer.from(arrayBuffer);
      };

      const aadhaarBuffer = await downloadDocument(aadhaar_path);
      const selfieBuffer = await downloadDocument(selfie_path);

      const result = await runRealKyc(aadhaarBuffer, selfieBuffer);

      // Securely persist verified/reviewed score to DB using service-role credentials
      const { error: dbError } = await supabaseAdmin
        .from("profiles")
        .update({
          kyc_score: result.kyc_score,
          face_match_score: result.face_match_score,
          kyc_auto_status: result.auto_status,
          extracted_data: result.extracted_data,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);

      if (dbError) {
        console.error("[kyc-verify] Failed to persist KYC result:", dbError);
      }

      res.json({ success: true, ...result });
    } catch (err: unknown) {
      console.error("KYC Processing error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // 17. Secure Admin Register endpoint
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

      // Force insert into profiles table as admin, in case the trigger skipped or defaulted it.
      // We do this to ensure the role escalates correctly through backend service_role.
      await supabaseAdmin.from("profiles").upsert({
        id: data.user.id,
        full_name: fullName,
        role: "admin"
      });

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
      const { taskId } = req.params;
      const { imageBase64, proof_type } = req.body;
      // proof_type: 'pickup' or 'delivery'
      // Authenticated identity instead of a client-supplied volunteer_id —
      // matches the pattern already used in verify-qr/abort below.
      const volunteer_id = req.user!.id;

      if (!imageBase64 || !proof_type) {
        return res.status(400).json({ error: "imageBase64 and proof_type are required" });
      }

      if (!['pickup', 'delivery'].includes(proof_type)) {
        return res.status(400).json({ error: "proof_type must be 'pickup' or 'delivery'" });
      }

      // Extract raw base64
      const raw = imageBase64.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(raw, 'base64');

      // Upload to Supabase Storage
      const fileName = `${taskId}/${proof_type}_${Date.now()}.jpg`;
      const { error: uploadErr } = await supabaseAdmin.storage
        .from('task_proofs')
        .upload(fileName, buffer, { contentType: 'image/jpeg', upsert: true });

      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabaseAdmin.storage.from('task_proofs').getPublicUrl(fileName);
      const publicUrl = urlData.publicUrl;

      // Save URL to volunteer_tasks
      const column = proof_type === 'pickup' ? 'pickup_image_url' : 'delivery_image_url';
      const { error: updateErr } = await supabaseAdmin
        .from('volunteer_tasks')
        .update({ [column]: publicUrl })
        .eq('id', taskId)
        .eq('volunteer_id', volunteer_id);

      if (updateErr) throw updateErr;

      res.json({ success: true, url: publicUrl });
    } catch (err: unknown) {
      console.error("Proof upload error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ─── 21. STALE TASK CLEANUP (cron-only — not for public/browser use) ─────────
  // Registered on both GET and POST:
  //  - Vercel Cron always invokes via GET, with `Authorization: Bearer
  //    <CRON_SECRET>` attached automatically once CRON_SECRET is set in your
  //    Vercel env vars — see the "crons" entry in vercel.json.
  //  - POST stays available for manual/admin triggering, passing the same
  //    secret as `?key=`.
  const cleanupStaleHandler = async (req: express.Request, res: express.Response) => {
    const provided =
      req.headers.authorization?.replace(/^Bearer\s+/i, "") ||
      (req.query?.key as string | undefined);
    const expected = process.env.CRON_SECRET;
    if (!expected || provided !== expected) {
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

      const { data, error } = await supabaseAdmin.rpc('generate_qr_token', {
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

      const { data, error } = await supabaseAdmin.rpc('verify_qr_token', {
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

      const { data, error } = await supabaseAdmin.rpc("abort_volunteer_task", {
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
  app.post("/api/llm/chat/completions", aiLimiter, async (req, res) => {
    if (!ai) {
      return res.status(503).json({ error: "Gemini API key not configured on server" });
    }

    try {
      const { messages, temperature } = req.body;
      
      if (!Array.isArray(messages) || messages.length === 0) {
        return res.json({ choices: [{ message: { content: "pong" } }] });
      }

      let systemContext = "";
      const contents = [];
      
      for (const msg of messages) {
        if (msg.role === "system") {
          systemContext += msg.content + "\n\n";
        } else {
          contents.push({
            role: msg.role === "assistant" ? "model" : "user",
            parts: [{ text: msg.content }]
          });
        }
      }

      // Prepend system prompt to the first user message
      if (systemContext && contents.length > 0 && contents[0].role === "user") {
        contents[0].parts[0].text = `System Instructions:\n${systemContext}\n\nUser Request:\n${contents[0].parts[0].text}`;
      }

      // Quick ping bypass for health checks
      if (contents.length === 1 && contents[0].parts[0].text === "ping") {
        return res.json({ choices: [{ message: { content: "pong" } }] });
      }

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents,
        config: {
          temperature: temperature ?? 0.7,
        }
      });

      // Return in OpenAI format for the frontend aiService
      res.json({
        choices: [
          {
            message: {
              content: response.text || ""
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
  // (configured via vercel.json's outputDirectory).
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
