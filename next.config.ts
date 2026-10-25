import type { NextConfig } from "next"

const isDev = process.env.NODE_ENV === "development"
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:55321"
const supabaseWs = supabase.replace(/^http/, "ws")
// Private bucket (R2 in production). Signed URLs only; this just lets the browser load them.
const storage = new URL(process.env.S3_ENDPOINT ?? "http://127.0.0.1:55321").origin
// LiveKit signalling (WebSocket) and its HTTP fallback.
const livekit = process.env.NEXT_PUBLIC_LIVEKIT_URL ?? "ws://127.0.0.1:7880"
const livekitHttp = livekit.replace(/^ws/, "http")

// Static CSP: nonces are incompatible with Partial Prerendering (Cache Components), so inline
// scripts are allowed. Everything else is locked to our own origin and named services.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' blob: data: ${storage}`,
  "font-src 'self'",
  `media-src 'self' blob: ${storage}`,
  `connect-src 'self' ${supabase} ${supabaseWs} ${storage} ${livekit} ${livekitHttp}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ")

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(self), microphone=(self), display-capture=(self), geolocation=(), payment=(), usb=()",
  },
  ...(isDev
    ? []
    : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
]

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  output: "standalone",
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      // Invite links carry a secret token: never leak it through the Referer header.
      { source: "/invite/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
    ]
  },
}

export default nextConfig
