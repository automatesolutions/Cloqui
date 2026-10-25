import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { randomUUID } from "node:crypto"
import { sql } from "drizzle-orm"
import type { CurrentUser } from "@/server/auth"
import { AccessDeniedError } from "@/server/authz"
import { systemDb } from "@/server/db"
import { putObject } from "@/server/media/storage"
import {
  addComment,
  canSeeVideoActivity,
  completeUpload,
  createVideoUpload,
  deleteVideo,
  downloadUrl,
  getVideoRole,
  getVideoView,
  issuePlayback,
  listAccessRequests,
  listComments,
  listGrants,
  listLibrary,
  removeGrant,
  requestAccess,
  resolveAccessRequest,
  setPasscode,
  shareVideo,
  unlockWithPasscode,
  updateShareSettings,
  updateVideoDetails,
} from "@/server/videos"
import { createWorkspace, UserFacingError } from "@/server/workspaces"
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
  colleague: CurrentUser,
  viewer: CurrentUser,
  editor: CurrentUser
let guest: CurrentUser, outsider: CurrentUser
const slug = `vid-${runId}`
let wsId: string
let videoId: string

const settings = {
  workspaceVisible: false,
  accessExpiresAt: null,
  viewOnly: false,
  watermark: false,
}

async function newVideo(by: CurrentUser, title = "Walkthrough") {
  const up = await createVideoUpload(by, slug, { title, mimeType: "video/webm", sizeBytes: 5 })
  const [row] = await systemDb.execute<{ key: string }>(
    sql`select original_key as key from public.videos where id = ${up.videoId}`
  )
  await putObject(row.key, new TextEncoder().encode("hello"), "video/webm")
  await completeUpload(by, up.videoId)
  return up.videoId
}

beforeAll(async () => {
  ;[owner, admin, colleague, viewer, editor, outsider] = await Promise.all([
    makeUser("v-owner"),
    makeUser("v-admin"),
    makeUser("v-colleague"),
    makeUser("v-viewer"),
    makeUser("v-editor"),
    makeUser("v-outsider"),
  ])
  guest = await makeUser("v-guest", "guest.example")
  await createWorkspace(owner, "Vids", slug)
  wsId = await wsIdBySlug(slug)
  await addMember(wsId, admin.id, "admin")
  await addMember(wsId, colleague.id, "member")
  await addMember(wsId, viewer.id, "member")
  await addMember(wsId, editor.id, "member")
  videoId = await newVideo(owner)
})

afterAll(async () => {
  await systemDb.execute(sql`delete from public.workspaces where slug = ${slug}`)
  await cleanupUsers()
})

describe("a new video is private to its owner", () => {
  it("the owner can see and play it", async () => {
    expect(await getVideoRole(owner, videoId)).toBe("owner")
    const p = await issuePlayback(owner, videoId)
    expect(p.src).toMatch(/X-Amz-Signature=/)
    expect(p.expiresAt - Date.now()).toBeLessThanOrEqual(300_000)
  })

  it.each([
    ["a colleague in the same workspace", () => colleague],
    ["a workspace admin", () => admin],
    ["an outsider", () => outsider],
    ["a guest", () => guest],
  ])("%s can't see it, list it, play it or comment", async (_, who) => {
    const u = who()
    expect(await getVideoRole(u, videoId)).toBeNull()
    expect(await visibleCount(u, "videos", `id = '${videoId}'`)).toBe(0)
    expect((await getVideoView(u, videoId)).kind).toBe("denied")
    await expect(issuePlayback(u, videoId)).rejects.toBeInstanceOf(AccessDeniedError)
    await expect(addComment(u, videoId, "hi", null)).rejects.toBeInstanceOf(AccessDeniedError)
    expect(await listComments(u, videoId)).toEqual([])
    const direct = await attempt(
      u,
      sql`insert into public.video_comments (video_id, author_id, body) values (${videoId}, ${u.id}, 'sneaky')`
    )
    expect(direct.ok).toBe(false)
  })

  it("doesn't show up in a colleague's library", async () => {
    const items = await listLibrary(colleague, slug)
    expect(items.map((i) => i.id)).not.toContain(videoId)
  })
})

describe("sharing with specific people", () => {
  beforeAll(async () => {
    await shareVideo(owner, videoId, [viewer.email], "viewer")
    await shareVideo(owner, videoId, [editor.email], "editor")
    await shareVideo(owner, videoId, [guest.email], "viewer")
  })

  it("viewers and editors get exactly their role", async () => {
    expect(await getVideoRole(viewer, videoId)).toBe("viewer")
    expect(await getVideoRole(editor, videoId)).toBe("editor")
    expect(await getVideoRole(colleague, videoId)).toBeNull()
  })

  it("a guest sees this one video and nothing of the workspace", async () => {
    expect(await getVideoRole(guest, videoId)).toBe("viewer")
    expect(await visibleCount(guest, "workspaces", `id = '${wsId}'`)).toBe(0)
    expect(await visibleCount(guest, "workspace_members", `workspace_id = '${wsId}'`)).toBe(0)
    const other = await newVideo(owner, "Other")
    expect(await getVideoRole(guest, other)).toBeNull()
  })

  it("only the owner can change who has access", async () => {
    await expect(shareVideo(editor, videoId, [colleague.email], "viewer")).rejects.toBeInstanceOf(
      AccessDeniedError
    )
    await expect(shareVideo(viewer, videoId, [colleague.email], "viewer")).rejects.toBeInstanceOf(
      AccessDeniedError
    )
    const direct = await attempt(
      editor,
      sql`insert into public.video_grants (video_id, user_id, role, granted_by) values (${videoId}, ${colleague.id}, 'viewer', ${editor.id})`
    )
    expect(direct.ok).toBe(false)
    await expect(
      updateShareSettings(editor, videoId, { ...settings, workspaceVisible: true })
    ).rejects.toBeInstanceOf(AccessDeniedError)
  })

  it("editors can edit details; viewers can't", async () => {
    await updateVideoDetails(editor, videoId, { title: "Walkthrough v2", description: "" })
    await expect(
      updateVideoDetails(viewer, videoId, { title: "x", description: "" })
    ).rejects.toBeInstanceOf(AccessDeniedError)
    const upd = await attempt(
      viewer,
      sql`update public.videos set title = 'hacked' where id = ${videoId}`
    )
    expect(upd).toMatchObject({ ok: true, count: 0 })
  })

  it("someone shared by email can watch once they sign up with that email", async () => {
    const label = `later-${randomUUID().slice(0, 6)}`
    const email = `${label}-${runId}@test.cloqui.dev` // what makeUser(label) will create
    await shareVideo(owner, videoId, [email], "viewer")
    const later = await makeUser(label)
    expect(later.email).toBe(email)
    expect(await getVideoRole(later, videoId)).toBe("viewer")
  })

  it("removing access works right away, even for an open player", async () => {
    const grants = await listGrants(owner, videoId)
    const g = grants.find((x) => x.userId === viewer.id)!
    await issuePlayback(viewer, videoId)
    await removeGrant(owner, videoId, g.id)
    expect(await getVideoRole(viewer, videoId)).toBeNull()
    await expect(issuePlayback(viewer, videoId)).rejects.toBeInstanceOf(AccessDeniedError)
    await shareVideo(owner, videoId, [viewer.email], "viewer")
  })
})

describe("sharing controls", () => {
  it("everyone in the workspace: members yes, guests and outsiders no", async () => {
    const v = await newVideo(owner, "Team update")
    await updateShareSettings(owner, v, { ...settings, workspaceVisible: true })
    expect(await getVideoRole(colleague, v)).toBe("viewer")
    expect(await getVideoRole(admin, v)).toBe("viewer")
    expect(await getVideoRole(outsider, v)).toBeNull()
    const g2 = await makeUser("v-ws-guest", "guest.example")
    await addMember(wsId, g2.id, "guest")
    expect(await getVideoRole(g2, v)).toBeNull()
  })

  it("an end date cuts off everyone but the owner", async () => {
    const v = await newVideo(owner, "Expiring")
    await shareVideo(owner, v, [viewer.email], "viewer")
    await updateShareSettings(owner, v, {
      ...settings,
      accessExpiresAt: new Date(Date.now() - 1000),
    })
    expect(await getVideoRole(viewer, v)).toBeNull()
    expect(await getVideoRole(owner, v)).toBe("owner")
  })

  it("view-only blocks downloads for viewers but not editors", async () => {
    const v = await newVideo(owner, "No download")
    await shareVideo(owner, v, [viewer.email], "viewer")
    await shareVideo(owner, v, [editor.email], "editor")
    await updateShareSettings(owner, v, { ...settings, viewOnly: true })
    await expect(downloadUrl(viewer, v)).rejects.toBeInstanceOf(AccessDeniedError)
    expect(await downloadUrl(editor, v)).toMatch(/X-Amz-Signature=/)
  })

  it("a passcode locks viewers until they enter it, and changing it locks them again", async () => {
    const v = await newVideo(owner, "Locked")
    await shareVideo(owner, v, [viewer.email], "viewer")
    await setPasscode(owner, v, "blue-door-7")
    expect((await getVideoView(viewer, v)).kind).toBe("passcode")
    await expect(issuePlayback(viewer, v)).rejects.toBeInstanceOf(AccessDeniedError)
    await expect(unlockWithPasscode(viewer, v, "wrong")).rejects.toBeInstanceOf(UserFacingError)
    await unlockWithPasscode(viewer, v, "blue-door-7")
    expect((await getVideoView(viewer, v)).kind).toBe("ok")
    await setPasscode(owner, v, "green-door-8")
    expect((await getVideoView(viewer, v)).kind).toBe("passcode")
    expect((await getVideoView(owner, v)).kind).toBe("ok")
    // The hash never leaves the server in a readable form, and a stranger can't unlock.
    await expect(unlockWithPasscode(outsider, v, "green-door-8")).rejects.toBeInstanceOf(
      AccessDeniedError
    )
  })
})

describe("requesting access", () => {
  it("an outsider can ask; the owner approves; then they can watch", async () => {
    const v = await newVideo(owner, "Ask me")
    await requestAccess(outsider, v)
    const view = await getVideoView(outsider, v)
    expect(view).toMatchObject({ kind: "denied", requested: true, ownerFirstName: "v-owner" })
    const reqs = await listAccessRequests(owner, v)
    expect(reqs.map((r) => r.requesterId)).toContain(outsider.id)
    expect(await listAccessRequests(colleague, v)).toEqual([])
    await expect(resolveAccessRequest(colleague, v, reqs[0].id, true)).rejects.toBeInstanceOf(
      AccessDeniedError
    )
    await resolveAccessRequest(owner, v, reqs[0].id, true)
    expect(await getVideoRole(outsider, v)).toBe("viewer")
  })

  it("asking about a video that doesn't exist reveals nothing", async () => {
    const ghost = randomUUID()
    await expect(requestAccess(colleague, ghost)).resolves.toBeUndefined()
    expect(await getVideoView(colleague, ghost)).toEqual({
      kind: "denied",
      ownerFirstName: null,
      requested: false,
    })
  })
})

describe("activity and deletion", () => {
  it("views are logged; owners and admins can read the item's activity, viewers can't", async () => {
    await issuePlayback(editor, videoId)
    expect(await canSeeVideoActivity(owner, videoId, wsId)).toBe(true)
    expect(await canSeeVideoActivity(admin, videoId, wsId)).toBe(true)
    expect(await canSeeVideoActivity(viewer, videoId, wsId)).toBe(false)
    expect(await visibleCount(viewer, "audit_events", `target_id = '${videoId}'`)).toBe(0)
    expect(
      await visibleCount(
        owner,
        "audit_events",
        `target_id = '${videoId}' and action = 'video.viewed'`
      )
    ).toBeGreaterThan(0)
  })

  it("media jobs are invisible to everyone signed in", async () => {
    expect((await attempt(owner, sql`select * from public.media_jobs`)).ok).toBe(false)
  })

  it("a deleted video is gone for everyone", async () => {
    const v = await newVideo(owner, "Delete me")
    await shareVideo(owner, v, [viewer.email], "viewer")
    await expect(deleteVideo(viewer, v)).rejects.toBeInstanceOf(AccessDeniedError)
    await deleteVideo(owner, v)
    expect(await getVideoRole(viewer, v)).toBeNull()
    expect(await getVideoRole(owner, v)).toBeNull()
  })
})
