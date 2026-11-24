import { productionHeaders } from "./server/productionHeaders.ts";

export const config = {
  buildCommand: "vite build",
  outputDirectory: "dist",
  rewrites: [
    {
      source: "/api/(.*)",
      destination: "/api"
    },
    {
      source: "/(.*)",
      destination: "/index.html"
    }
  ],
  functions: {
    "api/**/*.ts": {
      maxDuration: 60
    }
  },
  headers: [
    {
      source: "/(.*)",
      headers: productionHeaders(process.env.VITE_SUPABASE_URL)
    }
  ]
};
