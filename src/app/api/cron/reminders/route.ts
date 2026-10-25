import { timingSafeEqual } from "node:crypto"
import { NextResponse, type NextRequest } from "next/server"
import { runReminders } from "@/server/tasks"

// Called by Cloud Scheduler every 15 minutes with "Authorization: Bearer <CRON_SECRET>".
// Without a configured secret the endpoint doesn't exist.
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const given = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? ""
  if (
    !secret ||
    given.length !== secret.length ||
    !timingSafeEqual(Buffer.from(given), Buffer.from(secret))
  ) {
    return new NextResponse(null, { status: 404 })
  }
  return NextResponse.json(await runReminders())
}
