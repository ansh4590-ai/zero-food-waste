export function productionHeaders(supabaseUrl?: string) {
  const connectSources = [
    "'self'",
    "https://*.supabase.co",
    "wss://*.supabase.co",
    "https://router.project-osrm.org",
    "https://photon.komoot.io",
    "https://nominatim.openstreetmap.org",
  ];
  if (supabaseUrl) {
    const url = new URL(supabaseUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("VITE_SUPABASE_URL must use HTTP or HTTPS");
    }
    connectSources.push(url.origin);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    connectSources.push(url.origin);
  }

  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src ${connectSources.join(" ")}`,
    "worker-src 'self' blob:",
    "media-src 'self' blob:",
    "object-src 'none'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");

  return [
    {key: "X-Frame-Options", value: "DENY"},
    {key: "X-Content-Type-Options", value: "nosniff"},
    {key: "Referrer-Policy", value: "strict-origin-when-cross-origin"},
    {key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self)"},
    { key: "Content-Security-Policy", value: policy },
  ];
}
