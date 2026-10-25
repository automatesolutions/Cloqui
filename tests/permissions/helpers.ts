import { randomUUID } from "node:crypto"
import { createClient } from "@supabase/supabase-js"
import { sql } from "drizzle-orm"
import type { CurrentUser } from "@/server/auth"
import { systemDb, withRls } from "@/server/db"

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: { autoRefreshToken: false, persistSession: false },
  }
)

const created: string[] = []
export const runId = randomUUID().slice(0, 8)

/** A real, confirmed Supabase user, shaped like getCurrentUser() returns. */
export async function makeUser(label: string, domain = "test.cloqui.dev"): Promise<CurrentUser> {
  const email = `${label}-${runId}@${domain}`
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: `Pw-${randomUUID()}A1`,
    email_confirm: true,
    user_metadata: { display_name: label },
  })
  if (error || !data.user) throw error ?? new Error("createUser failed")
  created.push(data.user.id)
  return {
    id: data.user.id,
    email,
    displayName: label,
    claims: { sub: data.user.id, email },
    aal: "aal1",
    hasTwoFactor: false,
  }
}

export async function cleanupUsers() {
  for (const id of created.splice(0)) await admin.auth.admin.deleteUser(id)
}

/** Count rows a person can see in a table, under RLS. */
export async function visibleCount(user: CurrentUser, table: string, where = "true") {
  const rows = await withRls(user.claims, (tx) =>
    tx.execute<{ n: number }>(
      sql.raw(`select count(*)::int as n from public.${table} where ${where}`)
    )
  )
  return rows[0].n
}

/** Run raw SQL as a person and report whether Postgres refused it. */
export async function attempt(user: CurrentUser, query: ReturnType<typeof sql>) {
  try {
    const res = await withRls(user.claims, (tx) => tx.execute(query))
    return { ok: true as const, count: res.count ?? res.length }
  } catch (e) {
    return { ok: false as const, error: e as Error }
  }
}

export async function wsIdBySlug(slug: string) {
  const rows = await systemDb.execute<{ id: string }>(
    sql`select id from public.workspaces where slug = ${slug}`
  )
  return rows[0].id
}

export async function addMember(
  workspaceId: string,
  userId: string,
  role: "admin" | "member" | "guest"
) {
  await systemDb.execute(
    sql`insert into public.workspace_members (workspace_id, user_id, role) values (${workspaceId}, ${userId}, ${role}::public.workspace_role)`
  )
}
