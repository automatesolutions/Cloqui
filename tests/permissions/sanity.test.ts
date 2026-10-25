import { afterAll, describe, expect, it } from "vitest"
import { sql } from "drizzle-orm"
import { systemDb, withRls } from "@/server/db"
import { createWorkspace } from "@/server/workspaces"
import { cleanupUsers, makeUser, runId, visibleCount } from "./helpers"

// Guards against false greens: proves the RLS harness really switches identity.
describe("RLS harness", () => {
  afterAll(async () => {
    await systemDb.execute(sql`delete from public.workspaces where slug = ${"sanity-" + runId}`)
    await cleanupUsers()
  })

  it("runs as the authenticated role with the person's uid", async () => {
    const u = await makeUser("sanity")
    const [row] = await withRls(u.claims, (tx) =>
      tx.execute<{ role: string; uid: string }>(
        sql`select current_user as role, auth.uid()::text as uid`
      )
    )
    expect(row).toEqual({ role: "authenticated", uid: u.id })
  })

  it("shows rows to the right person and hides them from others", async () => {
    const owner = await makeUser("sanity-owner")
    const other = await makeUser("sanity-other")
    await createWorkspace(owner, "Sanity", `sanity-${runId}`)
    expect(await visibleCount(owner, "workspaces", `slug = 'sanity-${runId}'`)).toBe(1)
    expect(await visibleCount(other, "workspaces", `slug = 'sanity-${runId}'`)).toBe(0)
  })

  it("does not leak identity between transactions", async () => {
    const [row] = await systemDb.execute<{ uid: string | null }>(
      sql`select auth.uid()::text as uid`
    )
    expect(row.uid).toBeNull()
  })
})
