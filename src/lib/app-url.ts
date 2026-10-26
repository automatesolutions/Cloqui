/** Absolute URL on the public site.
 * Cloud Run listens on 0.0.0.0, so request.url and nextUrl.origin point there.
 * Redirects built from those send the browser to an address it cannot open.
 */
export function appURL(path: string): URL {
  return new URL(path, process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000")
}
