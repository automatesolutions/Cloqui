import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { sql } from "drizzle-orm"
import type { CurrentUser } from "@/server/auth"
import { AccessDeniedError, can } from "@/server/authz"
import { systemDb } from "@/server/db"
import { hashToken, newToken } from "@/server/tokens"
import {
  acceptInvite,
  changeMemberRole,
  createWorkspace,
  inviteMembers,
  listAuditEvents,
  listMembers,
  listOpenInvites,
  removeMember,
  UserFacingError,
} from "@/server/workspaces"
import {
  addMember,
  attempt,
  cleanupUsers,
  makeUser,
  runId,
  visibleCount,
  wsIdBySlug,
} from "./helpers"

let owner: CurrentUser,
  admin: CurrentUser,
  member: CurrentUser,
  guest: CurrentUser,
  outsider: CurrentUser
const slug = `acme-${runId}`
let wsId: string

beforeAll(async () => {
  ;[owner, admin, member, guest, outsider] = await Promise.all([
    makeUser("owner"),
    makeUser("admin"),
    makeUser("member"),
    makeUser("guest"),
    makeUser("outsider"),
  ])
  await createWorkspace(owner, "Acme", slug)
  wsId = await wsIdBySlug(slug)
  await addMember(wsId, admin.id, "admin")
  await addMember(wsId, member.id, "member")
  await addMember(wsId, guest.id, "guest")
})

afterAll(async () => {
  await systemDb.execute(sql`delete from public.workspaces where slug like ${"%-" + runId}`)
  await cleanupUsers()
})

describe("an uninvited person (RLS layer)", () => {
  it("can't see the workspace, its members, invites or audit log", async () => {
    expect(await visibleCount(outsider, "workspaces", `slug = '${slug}'`)).toBe(0)
    expect(await visibleCount(outsider, "workspace_members", `workspace_id = '${wsId}'`)).toBe(0)
    expect(await visibleCount(outsider, "workspace_invites", `workspace_id = '${wsId}'`)).toBe(0)
    expect(await visibleCount(outsider, "audit_events", `workspace_id = '${wsId}'`)).toBe(0)
  })

  it("can't see members' profiles or emails", async () => {
    expect(await visibleCount(outsider, "profiles", `id = '${owner.id}'`)).toBe(0)
  })

  it("can't add themselves as a member", async () => {
    const r = await attempt(
      outsider,
      sql`insert into public.workspace_members (workspace_id, user_id, role) values (${wsId}, ${outsider.id}, 'owner')`
    )
    expect(r.ok).toBe(false)
  })

  it("can't create an invite or write to the audit log", async () => {
    const { hash } = newToken()
    expect(
      (
        await attempt(
          outsider,
          sql`insert into public.workspace_invites (workspace_id, email, role, token_hash, invited_by) values (${wsId}, ${outsider.email}, 'member', ${hash}, ${outsider.id})`
        )
      ).ok
    ).toBe(false)
    expect(
      (
        await attempt(
          outsider,
          sql`insert into public.audit_events (workspace_id, actor_id, action) values (${wsId}, ${outsider.id}, 'fake')`
        )
      ).ok
    ).toBe(false)
  })

  it("can't rename or delete the workspace (no rows change)", async () => {
    const upd = await attempt(
      outsider,
      sql`update public.workspaces set name = 'Pwned' where id = ${wsId}`
    )
    const del = await attempt(outsider, sql`delete from public.workspaces where id = ${wsId}`)
    expect(upd).toMatchObject({ ok: true, count: 0 })
    expect(del).toMatchObject({ ok: true, count: 0 })
  })
})

describe("an uninvited person (authz layer)", () => {
  it("gets no access from can()", async () => {
    expect(await can(outsider, "workspace.view", slug)).toBeNull()
  })

  it("is refused by every workspace function", async () => {
    await expect(listMembers(outsider, slug)).rejects.toBeInstanceOf(AccessDeniedError)
    await expect(listOpenInvites(outsider, slug)).rejects.toBeInstanceOf(AccessDeniedError)
    await expect(listAuditEvents(outsider, slug)).rejects.toBeInstanceOf(AccessDeniedError)
    await expect(
      inviteMembers(outsider, slug, ["x@test.cloqui.dev"], "member")
    ).rejects.toBeInstanceOf(AccessDeniedError)
    await expect(removeMember(outsider, slug, member.id)).rejects.toBeInstanceOf(AccessDeniedError)
  })
})

describe("a guest", () => {
  it("has no workspace-level access", async () => {
    expect(await can(guest, "workspace.view", slug)).toBeNull()
    expect(await visibleCount(guest, "workspaces", `id = '${wsId}'`)).toBe(0)
    // They can see their own membership row, and nobody else's.
    expect(await visibleCount(guest, "workspace_members", `workspace_id = '${wsId}'`)).toBe(1)
  })
})

describe("a member", () => {
  it("sees the workspace and the member list", async () => {
    expect(await can(member, "workspace.view", slug)).not.toBeNull()
    const members = await listMembers(member, slug)
    expect(members.map((m) => m.userId).sort()).toEqual(
      [owner.id, admin.id, member.id, guest.id].sort()
    )
  })

  it("can't see invites or the audit log", async () => {
    expect(await visibleCount(member, "workspace_invites", `workspace_id = '${wsId}'`)).toBe(0)
    expect(await visibleCount(member, "audit_events", `workspace_id = '${wsId}'`)).toBe(0)
    await expect(listAuditEvents(member, slug)).rejects.toBeInstanceOf(AccessDeniedError)
  })

  it("can't invite people or change roles", async () => {
    await expect(
      inviteMembers(member, slug, ["y@test.cloqui.dev"], "member")
    ).rejects.toBeInstanceOf(AccessDeniedError)
    const r = await attempt(
      member,
      sql`update public.workspace_members set role = 'admin' where workspace_id = ${wsId} and user_id = ${member.id}`
    )
    expect(r).toMatchObject({ ok: true, count: 0 })
  })
})

describe("an admin", () => {
  it("can't change or remove the owner, even with a direct query", async () => {
    await expect(changeMemberRole(admin, slug, owner.id, "member")).rejects.toBeInstanceOf(
      AccessDeniedError
    )
    await expect(removeMember(admin, slug, owner.id)).rejects.toBeInstanceOf(AccessDeniedError)
    const upd = await attempt(
      admin,
      sql`update public.workspace_members set role = 'member' where workspace_id = ${wsId} and user_id = ${owner.id}`
    )
    const del = await attempt(
      admin,
      sql`delete from public.workspace_members where workspace_id = ${wsId} and user_id = ${owner.id}`
    )
    expect(upd).toMatchObject({ ok: true, count: 0 })
    expect(del).toMatchObject({ ok: true, count: 0 })
  })

  it("can't promote anyone to owner", async () => {
    await expect(changeMemberRole(admin, slug, member.id, "owner")).rejects.toBeInstanceOf(
      AccessDeniedError
    )
    const r = await attempt(
      admin,
      sql`update public.workspace_members set role = 'owner' where workspace_id = ${wsId} and user_id = ${member.id}`
    )
    expect(r.ok).toBe(false)
  })

  it("can invite, and every change lands in the audit log", async () => {
    const res = await inviteMembers(admin, slug, [`new-${runId}@test.cloqui.dev`], "member")
    expect(res.sent).toHaveLength(1)
    const events = await listAuditEvents(admin, slug)
    expect(events.some((e) => e.action === "member.invited")).toBe(true)
  })
})

describe("invites", () => {
  async function rawInvite(
    email: string,
    opts: { expired?: boolean; revoked?: boolean; role?: string } = {}
  ) {
    const { token, hash } = newToken()
    await systemDb.execute(sql`
      insert into public.workspace_invites (workspace_id, email, role, token_hash, invited_by, expires_at, revoked_at)
      values (${wsId}, ${email}, ${opts.role ?? "member"}::public.workspace_role, ${hash}, ${owner.id},
              ${opts.expired ? sql`now() - interval '1 day'` : sql`now() + interval '1 day'`},
              ${opts.revoked ? sql`now()` : null})`)
    return token
  }

  it("only works for the invited email", async () => {
    const token = await rawInvite(`someone-else-${runId}@test.cloqui.dev`)
    await expect(acceptInvite(outsider, token)).rejects.toBeInstanceOf(UserFacingError)
    expect(await can(outsider, "workspace.view", slug)).toBeNull()
  })

  it("doesn't work once expired or revoked", async () => {
    const p1 = await makeUser("late")
    const expired = await rawInvite(p1.email, { expired: true })
    await expect(acceptInvite(p1, expired)).rejects.toBeInstanceOf(UserFacingError)
    const p2 = await makeUser("revoked")
    const revoked = await rawInvite(p2.email, { revoked: true })
    await expect(acceptInvite(p2, revoked)).rejects.toBeInstanceOf(UserFacingError)
    expect(await can(p1, "workspace.view", slug)).toBeNull()
    expect(await can(p2, "workspace.view", slug)).toBeNull()
  })

  it("works once for the right person, then never again", async () => {
    const joiner = await makeUser("joiner")
    const token = await rawInvite(joiner.email)
    await acceptInvite(joiner, token)
    expect(await can(joiner, "workspace.view", slug)).not.toBeNull()
    await expect(acceptInvite(joiner, token)).rejects.toBeInstanceOf(UserFacingError)
  })

  it("respects the workspace's email-domain rule for non-guests", async () => {
    const domainSlug = `corp-${runId}`
    await createWorkspace(owner, "Corp", domainSlug)
    const corpId = await wsIdBySlug(domainSlug)
    await systemDb.execute(
      sql`update public.workspaces set allowed_email_domain = 'corp.example' where id = ${corpId}`
    )
    const stranger = await makeUser("stranger", "elsewhere.example")
    const { token, hash } = newToken()
    await systemDb.execute(sql`
      insert into public.workspace_invites (workspace_id, email, role, token_hash, invited_by)
      values (${corpId}, ${stranger.email}, 'member', ${hash}, ${owner.id})`)
    await expect(acceptInvite(stranger, token)).rejects.toBeInstanceOf(UserFacingError)
    expect(hashToken(token)).toBe(hash)
  })
})

describe("system tables", () => {
  it("rate limits are not reachable by signed-in people", async () => {
    expect((await attempt(member, sql`select * from public.rate_limits`)).ok).toBe(false)
    expect((await attempt(member, sql`select public.rate_limit_take('x', 1, 1)`)).ok).toBe(false)
  })
})
