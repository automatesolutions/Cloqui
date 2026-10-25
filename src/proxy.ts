import { NextResponse, type NextRequest } from "next/server"
import { updateSession } from "@/lib/supabase/proxy"

// Optimistic checks only. Real authorization happens next to the data (src/server/authz + RLS).
const appPrefixes = ["/home", "/w/", "/v/", "/shared", "/onboarding", "/settings"]
const authPages = ["/sign-in", "/sign-up"]

export async function proxy(request: NextRequest) {
  const { response, userId } = await updateSession(request)
  const { pathname, search } = request.nextUrl

  if (
    !userId &&
    appPrefixes.some((p) => pathname === p.replace(/\/$/, "") || pathname.startsWith(p))
  ) {
    const url = request.nextUrl.clone()
    url.pathname = "/sign-in"
    url.search = `?next=${encodeURIComponent(pathname + search)}`
    return NextResponse.redirect(url)
  }

  if (userId && authPages.includes(pathname)) {
    const next = request.nextUrl.searchParams.get("next")
    const target =
      next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")
        ? next
        : "/home"
    return NextResponse.redirect(new URL(target, request.url))
  }

  return response
}

export const config = {
  matcher: [
    // Everything except static files, images and the auth email callbacks' assets.
    "/((?!_next/static|_next/image|favicon.ico|fonts/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2)$).*)",
  ],
}
