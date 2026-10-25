import "server-only"
import { sql } from "drizzle-orm"
import { systemDb } from "@/server/db"

export const limits = {
  invite: { capacity: 30, perHour: 30 },
  accessRequest: { capacity: 5, perHour: 10 },
  createWorkspace: { capacity: 5, perHour: 5 },
  upload: { capacity: 50, perHour: 50 },
  // Bursts of 30, then one message every 3 seconds on average.
  chatMessage: { capacity: 30, perHour: 1200 },
  taskWrite: { capacity: 60, perHour: 1200 },
  // 5 tries, then one more every 5 minutes.
  passcode: { capacity: 5, perHour: 12 },
  // One "viewed" audit event per person per video every 30 minutes.
  viewLog: { capacity: 1, perHour: 2 },
} as const

/** Token bucket in Postgres. Returns true when allowed. Keys must not contain personal data. */
export async function takeToken(bucket: keyof typeof limits, subject: string): Promise<boolean> {
  const { capacity, perHour } = limits[bucket]
  const rows = await systemDb.execute<{ ok: boolean }>(
    sql`select public.rate_limit_take(${`${bucket}:${subject}`}, ${capacity}, ${perHour / 3600}) as ok`
  )
  return rows[0]?.ok === true
}
