import { NextResponse } from "next/server"
import { z } from "zod"
import { getCurrentUser } from "@/server/auth"
import { issuePlayback } from "@/server/videos"

// Fresh short-lived playback URLs for an open player. Every call re-checks access,
// so removing someone's access also stops their player at the next refresh.
export async function GET(_req: Request, ctx: RouteContext<"/api/videos/[id]/playback">) {
  const { id } = await ctx.params
  const user = await getCurrentUser()
  const parsed = z.uuid().safeParse(id)
  if (!user || !parsed.success) {
    return NextResponse.json(
      { error: "no_access" },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    )
  }
  try {
    const playback = await issuePlayback(user, parsed.data)
    return NextResponse.json(playback, { headers: { "Cache-Control": "private, no-store" } })
  } catch {
    return NextResponse.json(
      { error: "no_access" },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    )
  }
}
