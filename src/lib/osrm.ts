/**
 * Open Source Routing Machine (OSRM) Integration Service
 * Production-grade: retry logic, Haversine fallback, cache TTL
 */

export interface OSRMCoordinate {
  lat: number;
  lng: number;
}

export interface OSRMStep {
  maneuver?: { type?: string; modifier?: string };
  name?: string;
  distance?: number;
  duration?: number;
}

export interface OSRMRouteResult {
  geometry: OSRMCoordinate[];
  distanceMeters: number;
  durationSeconds: number;
  legs: Array<{ distance: number; duration: number; steps: OSRMStep[] }>;
  isFallback?: boolean; // true when using Haversine estimate
}

// Cache with 5-minute TTL
interface CacheEntry {
  result: OSRMRouteResult;
  expiresAt: number;
}
const routeCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Haversine straight-line fallback when OSRM is unavailable.
 * Returns a two-point geometry with distance and estimated duration at 35 km/h.
 */
export function haversineFallbackRoute(
  from: OSRMCoordinate,
  to: OSRMCoordinate
): OSRMRouteResult {
  const R = 6371000; // Earth radius in metres
  const φ1 = (from.lat * Math.PI) / 180;
  const φ2 = (to.lat * Math.PI) / 180;
  const Δφ = ((to.lat - from.lat) * Math.PI) / 180;
  const Δλ = ((to.lng - from.lng) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const distanceMeters = 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  // At 35 km/h average in city traffic
  const durationSeconds = (distanceMeters / 1000 / 35) * 3600;

  // Generate intermediate points for visual line
  const steps = 4;
  const geometry: OSRMCoordinate[] = [];
  for (let i = 0; i <= steps; i++) {
    geometry.push({
      lat: from.lat + (to.lat - from.lat) * (i / steps),
      lng: from.lng + (to.lng - from.lng) * (i / steps),
    });
  }

  return {
    geometry,
    distanceMeters,
    durationSeconds,
    legs: [{ distance: distanceMeters, duration: durationSeconds, steps: [] }],
    isFallback: true,
  };
}

/**
 * Estimate duration from distance using 35 km/h average city speed.
 */
export function estimateDurationFallback(distanceMeters: number): number {
  return (distanceMeters / 1000 / 35) * 3600;
}

/**
 * Fetch a route from OSRM with retry + Haversine fallback.
 */
export async function fetchOSRMRoute(
  points: OSRMCoordinate[],
  options?: { useCache?: boolean }
): Promise<OSRMRouteResult | null> {
  if (points.length < 2) return null;

  // Validate all points have valid coordinates
  if (points.some(p => !isFinite(p.lat) || !isFinite(p.lng) || (p.lat === 0 && p.lng === 0))) {
    return null;
  }

  const coordsString = points.map(p => `${p.lng},${p.lat}`).join(";");
  const cacheKey = coordsString;
  const useCache = options?.useCache !== false;

  // Check cache
  if (useCache) {
    const cached = routeCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.result;
    }
  }

  const url = `https://router.project-osrm.org/route/v1/driving/${coordsString}?overview=full&geometries=geojson&steps=true`;

  // Try up to 2 times with exponential backoff
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`OSRM HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data.code !== "Ok" || !data.routes?.length) {
        throw new Error("OSRM: No route found");
      }

      const route = data.routes[0];
      const rawGeometry: [number, number][] = route.geometry.coordinates;
      const geometry: OSRMCoordinate[] = rawGeometry.map(coord => ({
        lat: coord[1],
        lng: coord[0],
      }));

      const result: OSRMRouteResult = {
        geometry,
        distanceMeters: route.distance,
        durationSeconds: route.duration,
        legs: route.legs || [],
        isFallback: false,
      };

      // Cache result
      if (useCache) {
        routeCache.set(cacheKey, { result, expiresAt: Date.now() + CACHE_TTL_MS });
      }

      return result;
    } catch {
      if (attempt < 2) {
        // Wait 1.5s before retry
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }
  }

  // All attempts failed — use Haversine fallback with all stops
  if (points.length === 2) {
    return haversineFallbackRoute(points[0], points[1]);
  }

  // Multi-stop: chain haversine segments
  let totalDistance = 0;
  let totalDuration = 0;
  const geometry: OSRMCoordinate[] = [];
  const legs: Array<{ distance: number; duration: number; steps: OSRMStep[] }> = [];
  for (let i = 0; i < points.length - 1; i++) {
    const segment = haversineFallbackRoute(points[i], points[i + 1]);
    totalDistance += segment.distanceMeters;
    totalDuration += segment.durationSeconds;
    // Avoid duplicating the junction point
    if (i === 0) geometry.push(...segment.geometry);
    else geometry.push(...segment.geometry.slice(1));
    legs.push(segment.legs[0]);
  }

  return {
    geometry,
    distanceMeters: totalDistance,
    durationSeconds: totalDuration,
    legs,
    isFallback: true,
  };
}

export function formatETA(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return "–";
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins > 0 ? ` ${mins}m` : ""}`;
}

export function formatDistance(meters: number): string {
  if (!isFinite(meters) || meters <= 0) return "–";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}
