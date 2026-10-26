import { NextResponse } from "next/server"
import { getPublicView, isPublicToken } from "@/server/public-links"

// Fresh short-lived playback URLs for a public-link player. Every call re-checks the link,
// so turning it off (or an admin block, a new passcode, the end date) stops the player.
export async function GET(req: Request, ctx: RouteContext<"/api/p/[token]/playback">) {
  const { token } = await ctx.params
  const denied = NextResponse.json(
    { error: "no_access" },
    { status: 403, headers: { "Cache-Control": "no-store" } }
  )
  if (!isPublicToken(token)) return denied
  try {
    const view = await getPublicView(token, req.headers.get("x-cloqui-unlock"))
    if (view.kind !== "ok") return denied
    return NextResponse.json(view.playback, { headers: { "Cache-Control": "private, no-store" } })
  } catch {
    return denied
  }
}
