import "server-only"
import { sql } from "drizzle-orm"
import { systemDb } from "@/server/db"

export const limits = {
  invite: { capacity: 30, perHour: 30 },
  accessRequest: { capacity: 5, perHour: 10 },
  createWorkspace: { capacity: 5, perHour: 5 },
} as const

/** Token bucket in Postgres. Returns true when allowed. Keys must not contain personal data. */
export async function takeToken(bucket: keyof typeof limits, subject: string): Promise<boolean> {
  const { capacity, perHour } = limits[bucket]
  const rows = await systemDb.execute<{ ok: boolean }>(
    sql`select public.rate_limit_take(${`${bucket}:${subject}`}, ${capacity}, ${perHour / 3600}) as ok`
  )
  return rows[0]?.ok === true
}
