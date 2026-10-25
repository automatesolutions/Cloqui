import "server-only"
import { sql } from "drizzle-orm"
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { env } from "@/lib/env"
import * as schema from "./schema"

export type Db = PostgresJsDatabase<typeof schema>
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0]

/** Claims from a verified Supabase JWT. Only `sub` and `email` are needed by policies. */
export type RlsClaims = { sub: string; email?: string; role?: string; aal?: "aal1" | "aal2" }

const globalForDb = globalThis as unknown as { cloquiSql?: ReturnType<typeof postgres> }

// One pool per server instance. prepare:false keeps it compatible with the Supabase pooler.
const client =
  globalForDb.cloquiSql ?? postgres(env.DATABASE_URL, { prepare: false, max: 10, idle_timeout: 20 })
if (process.env.NODE_ENV !== "production") globalForDb.cloquiSql = client

const db = drizzle(client, { schema })

/**
 * Run queries as the signed-in person, with Postgres RLS enforced.
 * This is the default way to touch data. The `can()` checks in src/server/authz run first;
 * RLS is the second, independent layer.
 */
export function withRls<T>(claims: RlsClaims, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const jwt = JSON.stringify({ ...claims, role: "authenticated" })
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('request.jwt.claims', ${jwt}, true), set_config('role', 'authenticated', true)`
    )
    return fn(tx)
  })
}

/**
 * Bypasses RLS. Only for system work with no signed-in person (rate limits, jobs),
 * or after can() has already allowed the action. Grep for this in reviews.
 */
export const systemDb: Db = db
