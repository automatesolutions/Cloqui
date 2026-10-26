import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { sql } from "drizzle-orm"
import type { CurrentUser } from "@/server/auth"
import { AccessDeniedError } from "@/server/authz"
import { systemDb } from "@/server/db"
import { putObject } from "@/server/media/storage"
import {
  countPublicLinks,
  getPublicLinkState,
  getPublicView,
  hasPublicLink,
  setAllowPublicLinks,
  setPublicLink,
  unlockPublic,
} from "@/server/public-links"
import {
  completeUpload,
  createVideoUpload,
  deleteVideo,
  listLibrary,
  setPasscode,
  shareVideo,
  updateShareSettings,
} from "@/server/videos"
import { createWorkspace, UserFacingError } from "@/server/workspaces"
import { addMember, attempt, cleanupUsers, makeUser, runId, wsIdBySlug } from "./helpers"

// Public-link visitors have no session; the server only reads their (hashed) address.
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7" }),
}))

let owner: CurrentUser, admin: CurrentUser, viewer: CurrentUser, colleague: CurrentUser
let outsider: CurrentUser
const slug = `pub-${runId}`
let wsId: string
const tokenOf = (url: string | null) => url!.split("/p/")[1]

async function newVideo(by: CurrentUser, title = "Demo") {
  const up = await createVideoUpload(by, slug, { title, mimeType: "video/webm", sizeBytes: 5 })
  const [row] = await systemDb.execute<{ key: string }>(
    sql`select original_key as key from public.videos where id = ${up.videoId}`
  )
  await putObject(row.key, new TextEncoder().encode("hello"), "video/webm")
  await completeUpload(by, up.videoId)
  return up.videoId
}

beforeAll(async () => {
  ;[owner, admin, viewer, colleague, outsider] = await Promise.all([
    makeUser("p-owner"),
    makeUser("p-admin"),
    makeUser("p-viewer"),
    makeUser("p-colleague"),
    makeUser("p-outsider"),
  ])
  await createWorkspace(owner, "Pub", slug)
  wsId = await wsIdBySlug(slug)
  await addMember(wsId, admin.id, "admin")
  await addMember(wsId, viewer.id, "member")
  await addMember(wsId, colleague.id, "member")
})

afterAll(cleanupUsers)

describe("public links", () => {
  it("are off for a new video, and a made-up token shows nothing", async () => {
    const id = await newVideo(owner)
    expect(await getPublicLinkState(owner, id)).toEqual({ url: null, allowed: true })
    expect(await hasPublicLink(owner, id)).toBe(false)
    expect((await getPublicView("A".repeat(43))).kind).toBe("none")
    expect((await getPublicView("not-a-token")).kind).toBe("none")
  })

  it("only the owner can turn one on, and only the owner can read the link", async () => {
    const id = await newVideo(owner)
    await shareVideo(owner, id, [viewer.email], "editor")
    await expect(setPublicLink(viewer, id, true)).rejects.toBeInstanceOf(AccessDeniedError)
    await expect(setPublicLink(outsider, id, true)).rejects.toBeInstanceOf(AccessDeniedError)
    const url = await setPublicLink(owner, id, true)
    expect(url).toMatch(/\/p\/[A-Za-z0-9_-]{43}$/)
    // An editor knows a link exists (the chip says so) but can't read it, even with raw SQL.
    expect(await getPublicLinkState(viewer, id)).toBeNull()
    expect(await hasPublicLink(viewer, id)).toBe(true)
    const raw = await attempt(
      viewer,
      sql`select token from public.video_public_links where video_id = ${id}`
    )
    expect(raw).toEqual({ ok: true, count: 0 })
    // Someone the video isn't shared with learns nothing.
    expect(await hasPublicLink(outsider, id)).toBe(false)
  })

  it("plays for someone with no account, and only through the link", async () => {
    const id = await newVideo(owner, "Launch plan")
    const token = tokenOf(await setPublicLink(owner, id, true))
    const view = await getPublicView(token)
    expect(view.kind).toBe("ok")
    if (view.kind === "ok") {
      expect(view.title).toBe("Launch plan")
      expect(view.playback.src).toContain("X-Amz-Signature")
      // Nothing about who else can see it, and no account details.
      expect(Object.keys(view).sort()).toEqual([
        "createdAt",
        "description",
        "durationMs",
        "kind",
        "ownerFirstName",
        "playback",
        "title",
      ])
    }
    // The anonymous view is in the owner's activity log, with no actor.
    const [ev] = await systemDb.execute<{ actor: string | null }>(
      sql`select actor_id as actor from public.audit_events where target_id = ${id} and action = 'video.viewed_public'`
    )
    expect(ev).toEqual({ actor: null })
  })

  it("turning it off kills the link, and turning it on again makes a new one", async () => {
    const id = await newVideo(owner)
    const first = tokenOf(await setPublicLink(owner, id, true))
    await setPublicLink(owner, id, false)
    expect((await getPublicView(first)).kind).toBe("none")
    const second = tokenOf(await setPublicLink(owner, id, true))
    expect(second).not.toBe(first)
    expect((await getPublicView(first)).kind).toBe("none")
    expect((await getPublicView(second)).kind).toBe("ok")
  })

  it("stops when the access end date passes or the video is deleted", async () => {
    const id = await newVideo(owner)
    const token = tokenOf(await setPublicLink(owner, id, true))
    await systemDb.execute(
      sql`update public.videos set access_expires_at = now() - interval '1 minute' where id = ${id}`
    )
    expect((await getPublicView(token)).kind).toBe("none")
    await updateShareSettings(owner, id, {
      workspaceVisible: false,
      accessExpiresAt: null,
      viewOnly: false,
      watermark: false,
    })
    expect((await getPublicView(token)).kind).toBe("ok")
    await deleteVideo(owner, id)
    expect((await getPublicView(token)).kind).toBe("none")
  })

  it("asks for the passcode, and a new passcode locks out old unlocks", async () => {
    const id = await newVideo(owner)
    const token = tokenOf(await setPublicLink(owner, id, true))
    await setPasscode(owner, id, "tulip-42")
    expect((await getPublicView(token)).kind).toBe("passcode")
    await expect(unlockPublic(token, "wrong")).rejects.toBeInstanceOf(UserFacingError)
    const unlock = await unlockPublic(token, "tulip-42")
    expect((await getPublicView(token, unlock)).kind).toBe("ok")
    expect((await getPublicView(token, "made-up-unlock")).kind).toBe("passcode")
    await setPasscode(owner, id, "rose-77")
    expect((await getPublicView(token, unlock)).kind).toBe("passcode")
  })

  it("an unlock for one video doesn't open another", async () => {
    const a = await newVideo(owner)
    const b = await newVideo(owner)
    const ta = tokenOf(await setPublicLink(owner, a, true))
    const tb = tokenOf(await setPublicLink(owner, b, true))
    await setPasscode(owner, a, "same-code")
    await setPasscode(owner, b, "same-code")
    const unlockA = await unlockPublic(ta, "same-code")
    expect((await getPublicView(tb, unlockA)).kind).toBe("passcode")
  })

  it("can't be created by raw SQL for someone else's video, or with a chosen token", async () => {
    const id = await newVideo(owner)
    await shareVideo(owner, id, [viewer.email], "editor")
    const token = "B".repeat(43)
    const res = await attempt(
      viewer,
      sql`insert into public.video_public_links (video_id, token, created_by) values (${id}, ${token}, ${viewer.id})`
    )
    expect(res.ok).toBe(false)
    // public_video_id is for the server only.
    const fn = await attempt(owner, sql`select public.public_video_id(${token})`)
    expect(fn.ok).toBe(false)
  })

  it("members can't change the workspace setting; admins can", async () => {
    await expect(setAllowPublicLinks(colleague, slug, false)).rejects.toBeInstanceOf(
      AccessDeniedError
    )
    await expect(countPublicLinks(colleague, slug)).rejects.toBeInstanceOf(AccessDeniedError)
    const res = await attempt(
      colleague,
      sql`update public.workspaces set allow_public_links = false where id = ${wsId}`
    )
    expect(!res.ok || res.count === 0).toBe(true)
    const [ws] = await systemDb.execute<{ allow: boolean }>(
      sql`select allow_public_links as allow from public.workspaces where id = ${wsId}`
    )
    expect(ws.allow).toBe(true)
  })

  it("an admin block stops every link, including on videos the admin can't see", async () => {
    const mine = await newVideo(owner)
    const theirs = await newVideo(colleague, "Private to colleague")
    const t1 = tokenOf(await setPublicLink(owner, mine, true))
    const t2 = tokenOf(await setPublicLink(colleague, theirs, true))
    expect(await countPublicLinks(admin, slug)).toBeGreaterThanOrEqual(2)

    const removed = await setAllowPublicLinks(admin, slug, false)
    expect(removed).toBeGreaterThanOrEqual(2)
    expect((await getPublicView(t1)).kind).toBe("none")
    expect((await getPublicView(t2)).kind).toBe("none")
    expect(await countPublicLinks(admin, slug)).toBe(0)

    // While blocked, owners can't make new ones, through the app or raw SQL.
    await expect(setPublicLink(owner, mine, true)).rejects.toBeInstanceOf(UserFacingError)
    const raw = await attempt(
      owner,
      sql`insert into public.video_public_links (video_id, token, created_by) values (${mine}, ${"C".repeat(43)}, ${owner.id})`
    )
    expect(raw.ok).toBe(false)
    expect(await getPublicLinkState(owner, mine)).toEqual({ url: null, allowed: false })

    // Allowing them again doesn't bring the old links back.
    await setAllowPublicLinks(admin, slug, true)
    expect((await getPublicView(t1)).kind).toBe("none")
    expect((await getPublicView(t2)).kind).toBe("none")
  })

  it("the library chip says Anyone with the link", async () => {
    const id = await newVideo(owner, "Chip check")
    await setPublicLink(owner, id, true)
    const items = await listLibrary(owner, slug, "mine")
    expect(items.find((i) => i.id === id)?.publicLink).toBe(true)
  })
})
