import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { sql } from "drizzle-orm"
import type { CurrentUser } from "@/server/auth"
import { deleteMyAccount, exportMyData } from "@/server/account"
import { AccessDeniedError, needsTwoFactorFor } from "@/server/authz"
import { createChannel, postMessage } from "@/server/chat"
import { systemDb } from "@/server/db"
import { createSpace } from "@/server/tasks"
import { createVideoUpload } from "@/server/videos"
import {
  deleteWorkspace,
  exportWorkspace,
  getSecuritySettings,
  runRetention,
  setRequireTwoFactor,
  setRetention,
} from "@/server/workspace-admin"
import { createWorkspace, UserFacingError } from "@/server/workspaces"
import { addMember, cleanupUsers, makeUser, runId, visibleCount, wsIdBySlug } from "./helpers"

/** The same person after entering their authenticator code (what RLS sees from an aal2 session). */
const withCode = (u: CurrentUser): CurrentUser => ({
  ...u,
  aal: "aal2",
  hasTwoFactor: true,
  claims: { ...u.claims, aal: "aal2" },
})

const slug = `admin-${runId}`
let owner: CurrentUser, admin: CurrentUser, member: CurrentUser, guest: CurrentUser, stranger: CurrentUser
let ws: string, openChannel: string, privateChannel: string, space: string, videoId: string

beforeAll(async () => {
  ;[owner, admin, member, guest, stranger] = await Promise.all([
    makeUser("a-owner"),
    makeUser("a-admin"),
    makeUser("a-member"),
    makeUser("a-guest"),
    makeUser("a-stranger"),
  ])
  await createWorkspace(owner, "Admin Co", slug)
  ws = await wsIdBySlug(slug)
  await addMember(ws, admin.id, "admin")
  await addMember(ws, member.id, "member")
  await addMember(ws, guest.id, "guest")
  openChannel = await createChannel(owner, slug, { name: "general", topic: "", isPrivate: false, memberIds: [member.id] })
  privateChannel = await createChannel(owner, slug, { name: "board", topic: "", isPrivate: true, memberIds: [member.id] })
  await postMessage(member, privateChannel, { body: "Board-only note" })
  space = await createSpace(owner, slug, { name: "Ops", isPrivate: true, memberIds: [member.id] })
  videoId = (await createVideoUpload(member, slug, { title: "Member video", mimeType: "video/webm", sizeBytes: 5 })).videoId
})

afterAll(cleanupUsers)

describe("require two-step sign-in", () => {
  afterAll(async () => {
    await systemDb.execute(sql`update public.workspaces set require_2fa = false where id = ${ws}`)
  })

  it("an admin can't require it until they use it themselves", async () => {
    await expect(setRequireTwoFactor(admin, slug, true)).rejects.toBeInstanceOf(UserFacingError)
  })

  it("members and guests can't change it", async () => {
    await expect(setRequireTwoFactor(withCode(member), slug, true)).rejects.toBeInstanceOf(AccessDeniedError)
    await expect(setRequireTwoFactor(withCode(guest), slug, true)).rejects.toBeInstanceOf(AccessDeniedError)
  })

  it("once required, a session without the code sees nothing, however access was given", async () => {
    await setRequireTwoFactor(withCode(admin), slug, true)
    // Workspace, membership-based reads, and direct invites (private channel, private space, own video).
    expect(await visibleCount(member, "workspaces", `id = '${ws}'`)).toBe(0)
    expect(await visibleCount(member, "chat_channels", `workspace_id = '${ws}'`)).toBe(0)
    expect(await visibleCount(member, "chat_messages", `channel_id = '${privateChannel}'`)).toBe(0)
    expect(await visibleCount(member, "task_spaces", `id = '${space}'`)).toBe(0)
    expect(await visibleCount(member, "videos", `id = '${videoId}'`)).toBe(0)
    await expect(postMessage(member, openChannel, { body: "hi" })).rejects.toThrow()
    expect(await needsTwoFactorFor(member, slug)).toBe(true)
  })

  it("the same person with the code gets everything back", async () => {
    const m = withCode(member)
    expect(await visibleCount(m, "workspaces", `id = '${ws}'`)).toBe(1)
    expect(await visibleCount(m, "chat_messages", `channel_id = '${privateChannel}'`)).toBe(1)
    expect(await visibleCount(m, "task_spaces", `id = '${space}'`)).toBe(1)
    expect(await visibleCount(m, "videos", `id = '${videoId}'`)).toBe(1)
    expect(await needsTwoFactorFor(m, slug)).toBe(false)
  })

  it("people outside the workspace aren't told it requires anything", async () => {
    expect(await needsTwoFactorFor(stranger, slug)).toBe(false)
  })

  it("admins see who hasn't set it up, nobody else sees the list", async () => {
    const s = await getSecuritySettings(withCode(admin), slug)
    expect(s.require2fa).toBe(true)
    expect(s.membersWithoutTwoFactor.map((m) => m.id)).toContain(member.id)
    await expect(getSecuritySettings(withCode(member), slug)).rejects.toBeInstanceOf(AccessDeniedError)
    await expect(getSecuritySettings(stranger, slug)).rejects.toBeInstanceOf(AccessDeniedError)
  })
})

describe("workspace export", () => {
  it("only admins can download it", async () => {
    await expect(exportWorkspace(member, slug)).rejects.toBeInstanceOf(AccessDeniedError)
    await expect(exportWorkspace(guest, slug)).rejects.toBeInstanceOf(AccessDeniedError)
    await expect(exportWorkspace(stranger, slug)).rejects.toBeInstanceOf(AccessDeniedError)
  })

  it("leaves out private channels and spaces the admin isn't in", async () => {
    const data = await exportWorkspace(admin, slug)
    expect(data.channels.map((c) => c.id)).toContain(openChannel)
    expect(data.channels.map((c) => c.id)).not.toContain(privateChannel)
    expect(data.messages.some((m) => m.body === "Board-only note")).toBe(false)
    expect(data.spaces.map((s) => s.id)).not.toContain(space)
  })
})

describe("your own export", () => {
  it("has your content and nobody else's", async () => {
    const mine = await exportMyData(member)
    expect(mine.messages.map((m) => m.body)).toContain("Board-only note")
    const theirs = await exportMyData(admin)
    expect(theirs.messages.map((m) => m.body)).not.toContain("Board-only note")
  })
})

describe("retention", () => {
  it("only admins can change it", async () => {
    await expect(setRetention(member, slug, { retentionVideoDays: 30, retentionMessageDays: 30 })).rejects.toBeInstanceOf(AccessDeniedError)
  })

  it("deletes messages older than the setting and keeps newer ones", async () => {
    const oldId = await postMessage(owner, openChannel, { body: "From long ago" })
    const newId = await postMessage(owner, openChannel, { body: "From today" })
    await systemDb.execute(sql`update public.chat_messages set created_at = now() - interval '40 days' where id = ${oldId}`)
    await setRetention(admin, slug, { retentionVideoDays: null, retentionMessageDays: 30 })
    const res = await runRetention()
    expect(res.messagesDeleted).toBeGreaterThanOrEqual(1)
    const left = await systemDb.execute<{ id: string }>(sql`select id from public.chat_messages where id in (${oldId}, ${newId})`)
    expect(left.map((r) => r.id)).toEqual([newId])
    await setRetention(admin, slug, { retentionVideoDays: null, retentionMessageDays: null })
  })

  it("deletes videos older than the setting", async () => {
    const fresh = (await createVideoUpload(member, slug, { title: "New one", mimeType: "video/webm", sizeBytes: 5 })).videoId
    const old = (await createVideoUpload(member, slug, { title: "Old one", mimeType: "video/webm", sizeBytes: 5 })).videoId
    await systemDb.execute(sql`update public.videos set created_at = now() - interval '100 days' where id = ${old}`)
    await setRetention(admin, slug, { retentionVideoDays: 90, retentionMessageDays: null })
    await runRetention()
    const left = await systemDb.execute<{ id: string }>(sql`select id from public.videos where id in (${old}, ${fresh})`)
    expect(left.map((r) => r.id)).toEqual([fresh])
    await setRetention(admin, slug, { retentionVideoDays: null, retentionMessageDays: null })
  })
})

describe("deleting", () => {
  it("only the owner can delete the workspace, and only by typing its name", async () => {
    await expect(deleteWorkspace(admin, slug, "Admin Co")).rejects.toBeInstanceOf(AccessDeniedError)
    await expect(deleteWorkspace(stranger, slug, "Admin Co")).rejects.toBeInstanceOf(AccessDeniedError)
    await expect(deleteWorkspace(owner, slug, "Admin")).rejects.toBeInstanceOf(UserFacingError)
  })

  it("an owner can't delete their account while others are in their workspace", async () => {
    await expect(deleteMyAccount(owner, owner.email)).rejects.toBeInstanceOf(UserFacingError)
  })

  it("deleting your account needs your exact email", async () => {
    await expect(deleteMyAccount(stranger, "nope@example.com")).rejects.toBeInstanceOf(UserFacingError)
  })

  it("the owner can delete it, and it's gone for everyone", async () => {
    await deleteWorkspace(owner, slug, "Admin Co")
    const rows = await systemDb.execute(sql`select 1 from public.workspaces where id = ${ws}`)
    expect(rows.length).toBe(0)
    expect(await visibleCount(member, "chat_channels", `id = '${openChannel}'`)).toBe(0)
  })
})
