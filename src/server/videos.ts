import "server-only"
import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm"
import { env } from "@/lib/env"
import type { CurrentUser } from "@/server/auth"
import { AccessDeniedError, authorize } from "@/server/authz"
import { systemDb, withRls, type Tx } from "@/server/db"
import {
  auditEvents,
  mediaJobs,
  profiles,
  videoAccessRequests,
  videoComments,
  videoGrants,
  videoPasscodeUnlocks,
  videoReactions,
  videos,
  workspaceMembers,
  workspaces,
  type ItemRole,
  type ReactionEmoji,
  type VideoRole,
} from "@/server/db/schema"
import { sendEmail } from "@/server/email"
import { hashPasscode, verifyPasscode } from "@/server/media/passcode"
import {
  deleteObjects,
  headObject,
  presignRead,
  presignUpload,
  videoKeys,
} from "@/server/media/storage"
import { takeToken } from "@/server/rate-limit"
import { UserFacingError } from "@/server/workspaces"

export const MAX_UPLOAD_BYTES = 2 * 1024 ** 3 // 2 GB
const ALLOWED_TYPES: Record<string, string> = {
  "video/webm": "webm",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
}

export type VideoAuditAction =
  | "video.created"
  | "video.viewed"
  | "video.updated"
  | "video.deleted"
  | "video.shared"
  | "video.unshared"
  | "video.role_changed"
  | "video.settings_changed"
  | "video.access_requested"
  | "video.access_approved"
  | "video.access_declined"
  | "video.passcode_failed"

async function videoAudit(
  tx: Tx | typeof systemDb,
  e: {
    workspaceId: string
    actorId: string
    videoId: string
    action: VideoAuditAction
    metadata?: Record<string, unknown>
  }
) {
  await tx.insert(auditEvents).values({
    workspaceId: e.workspaceId,
    actorId: e.actorId,
    action: e.action,
    targetType: "video",
    targetId: e.videoId,
    metadata: e.metadata ?? {},
  })
}

// ── Access ──────────────────────────────────────────────────────────────────

/** The person's role on a video (owner/editor/viewer) or null. Same rule as RLS: public.video_role(). */
export async function getVideoRole(user: CurrentUser, videoId: string): Promise<VideoRole | null> {
  const rows = await withRls(user.claims, (tx) =>
    tx.execute<{ role: VideoRole | null }>(sql`select public.video_role(${videoId}::uuid) as role`)
  )
  return rows[0]?.role ?? null
}

async function requireRole(user: CurrentUser, videoId: string, allowed: VideoRole[]) {
  const role = await getVideoRole(user, videoId)
  if (!role || !allowed.includes(role)) throw new AccessDeniedError()
  return role
}

type VideoRow = typeof videos.$inferSelect

export type VideoView =
  | { kind: "denied"; ownerFirstName: string | null; requested: boolean }
  | { kind: "passcode"; video: Pick<VideoRow, "id" | "title">; ownerFirstName: string | null }
  | {
      kind: "ok"
      role: VideoRole
      video: VideoRow
      workspace: { name: string; slug: string; isMember: boolean }
      owner: { id: string; name: string }
    }

/** Everything the video page needs to decide what to show. */
export async function getVideoView(user: CurrentUser, videoId: string): Promise<VideoView> {
  return withRls(user.claims, async (tx) => {
    const [r] = await tx.execute<{ role: VideoRole | null; owner: string | null }>(
      sql`select public.video_role(${videoId}::uuid) as role, public.video_owner_first_name(${videoId}::uuid) as owner`
    )
    if (!r?.role) {
      const [req] = await tx
        .select({ id: videoAccessRequests.id })
        .from(videoAccessRequests)
        .where(
          and(
            eq(videoAccessRequests.videoId, videoId),
            eq(videoAccessRequests.requesterId, user.id),
            eq(videoAccessRequests.status, "pending")
          )
        )
      return { kind: "denied", ownerFirstName: r?.owner ?? null, requested: !!req }
    }
    const [video] = await tx.select().from(videos).where(eq(videos.id, videoId))
    if (!video) return { kind: "denied", ownerFirstName: null, requested: false }

    if (video.passcodeHash && r.role !== "owner") {
      const [unlock] = await tx
        .select({ v: videoPasscodeUnlocks.passcodeVersion })
        .from(videoPasscodeUnlocks)
        .where(
          and(eq(videoPasscodeUnlocks.videoId, videoId), eq(videoPasscodeUnlocks.userId, user.id))
        )
      if (!unlock || unlock.v !== video.passcodeVersion) {
        return {
          kind: "passcode",
          video: { id: video.id, title: video.title },
          ownerFirstName: r.owner,
        }
      }
    }

    // The workspace name is not secret to someone the video was shared with; read it as system.
    const [ws] = await systemDb
      .select({ name: workspaces.name, slug: workspaces.slug })
      .from(workspaces)
      .where(eq(workspaces.id, video.workspaceId))
    const [member] = await tx
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, video.workspaceId),
          eq(workspaceMembers.userId, user.id)
        )
      )
    const [owner] = await systemDb
      .select({ name: profiles.displayName })
      .from(profiles)
      .where(eq(profiles.id, video.ownerId))
    return {
      kind: "ok",
      role: r.role,
      video,
      workspace: { name: ws.name, slug: ws.slug, isMember: !!member && member.role !== "guest" },
      owner: { id: video.ownerId, name: owner?.name ?? "Someone" },
    }
  })
}

// ── Library ─────────────────────────────────────────────────────────────────

export type LibraryItem = {
  id: string
  title: string
  status: VideoRow["status"]
  durationMs: number | null
  createdAt: Date
  ownerId: string
  ownerName: string
  workspaceVisible: boolean
  thumbnailUrl: string | null
  shareCount: number
  firstShareName: string | null
  hasPasscode: boolean
}

export async function listLibrary(
  user: CurrentUser,
  slug: string,
  filter: "all" | "mine" | "shared" = "all",
  limit = 60
): Promise<LibraryItem[]> {
  const { workspace } = await authorize(user, "workspace.view", slug)
  const rows = await withRls(user.claims, (tx) =>
    tx
      .select({
        id: videos.id,
        title: videos.title,
        status: videos.status,
        durationMs: videos.durationMs,
        createdAt: videos.createdAt,
        ownerId: videos.ownerId,
        ownerName: profiles.displayName,
        workspaceVisible: videos.workspaceVisible,
        thumbnailKey: videos.thumbnailKey,
        hasPasscode: sql<boolean>`${videos.passcodeHash} is not null`,
        shareCount: sql<number>`(select count(*)::int from public.video_grants g where g.video_id = ${videos.id})`,
        firstShareName: sql<string | null>`(
          select coalesce(p.display_name, g.email::text) from public.video_grants g
          left join public.profiles p on p.id = g.user_id
          where g.video_id = ${videos.id} order by g.created_at limit 1)`,
      })
      .from(videos)
      .leftJoin(profiles, eq(profiles.id, videos.ownerId))
      .where(
        and(
          eq(videos.workspaceId, workspace.id),
          isNull(videos.deletedAt),
          filter === "mine" ? eq(videos.ownerId, user.id) : undefined,
          filter === "shared" ? sql`${videos.ownerId} <> ${user.id}` : undefined
        )
      )
      .orderBy(desc(videos.createdAt))
      .limit(limit)
  )
  return Promise.all(
    rows.map(async ({ thumbnailKey, ownerName, ...r }) => ({
      ...r,
      ownerName: ownerName ?? "Someone",
      thumbnailUrl: thumbnailKey ? await presignRead(thumbnailKey) : null,
    }))
  )
}

/** Videos shared with a person outside their workspaces (guests), for /shared. */
export async function listSharedWithMe(user: CurrentUser) {
  return withRls(user.claims, (tx) =>
    tx
      .select({
        id: videos.id,
        title: videos.title,
        createdAt: videos.createdAt,
        ownerName: profiles.displayName,
      })
      .from(videos)
      .leftJoin(profiles, eq(profiles.id, videos.ownerId))
      .where(and(isNull(videos.deletedAt), sql`${videos.ownerId} <> ${user.id}`))
      .orderBy(desc(videos.createdAt))
      .limit(100)
  )
}

// ── Uploading ───────────────────────────────────────────────────────────────

export async function createVideoUpload(
  user: CurrentUser,
  slug: string,
  input: {
    title: string
    mimeType: string
    sizeBytes: number
    durationMs?: number
    trimStartMs?: number
    trimEndMs?: number
  }
) {
  const { workspace } = await authorize(user, "workspace.view", slug)
  const baseType = input.mimeType.split(";")[0].trim().toLowerCase()
  const ext = ALLOWED_TYPES[baseType]
  if (!ext)
    throw new UserFacingError(
      "That file type isn't supported. Record again, or upload an MP4 or WebM."
    )
  if (input.sizeBytes <= 0 || input.sizeBytes > MAX_UPLOAD_BYTES) {
    throw new UserFacingError("Videos can be up to 2 GB.")
  }
  if (!(await takeToken("upload", user.id))) {
    throw new UserFacingError("You've uploaded a lot today. Try again in an hour.")
  }

  const id = crypto.randomUUID()
  const keys = videoKeys(workspace.id, id)
  const originalKey = keys.original(ext)
  await withRls(user.claims, (tx) =>
    tx.insert(videos).values({
      id,
      workspaceId: workspace.id,
      ownerId: user.id,
      title: input.title,
      mimeType: baseType,
      sizeBytes: input.sizeBytes,
      durationMs: input.durationMs ?? null,
      originalKey,
      trimStartMs: input.trimStartMs ?? null,
      trimEndMs: input.trimEndMs ?? null,
    })
  )
  return {
    videoId: id,
    uploadUrl: await presignUpload(originalKey, baseType),
    contentType: baseType,
  }
}

/** Called after the browser finished the PUT. Checks the object really exists, then queues processing. */
export async function completeUpload(user: CurrentUser, videoId: string) {
  await requireRole(user, videoId, ["owner"])
  const video = await withRls(
    user.claims,
    async (tx) => (await tx.select().from(videos).where(eq(videos.id, videoId)))[0]
  )
  if (!video || video.status !== "uploading") return
  const head = await headObject(video.originalKey)
  if (!head || head.size === 0)
    throw new UserFacingError("The upload didn't finish. Try saving again.")
  if (head.size > MAX_UPLOAD_BYTES) {
    await deleteObjects([video.originalKey])
    throw new UserFacingError("Videos can be up to 2 GB.")
  }
  await withRls(user.claims, async (tx) => {
    await tx
      .update(videos)
      .set({ status: "processing", sizeBytes: head.size })
      .where(eq(videos.id, videoId))
    await videoAudit(tx, {
      workspaceId: video.workspaceId,
      actorId: user.id,
      videoId,
      action: "video.created",
    })
  })
  await systemDb.insert(mediaJobs).values({ videoId, kind: "process" })
}

// ── Editing ─────────────────────────────────────────────────────────────────

export async function updateVideoDetails(
  user: CurrentUser,
  videoId: string,
  patch: { title: string; description: string }
) {
  await requireRole(user, videoId, ["owner", "editor"])
  await withRls(user.claims, async (tx) => {
    const [v] = await tx
      .update(videos)
      .set(patch)
      .where(eq(videos.id, videoId))
      .returning({ ws: videos.workspaceId })
    await videoAudit(tx, { workspaceId: v.ws, actorId: user.id, videoId, action: "video.updated" })
  })
}

/** Set trim points and re-process. Trimming is non-destructive: the original stays in the bucket. */
export async function setTrim(
  user: CurrentUser,
  videoId: string,
  startMs: number | null,
  endMs: number | null
) {
  await requireRole(user, videoId, ["owner", "editor"])
  await withRls(user.claims, async (tx) => {
    const [v] = await tx
      .update(videos)
      .set({ trimStartMs: startMs, trimEndMs: endMs, status: "processing" })
      .where(eq(videos.id, videoId))
      .returning({ ws: videos.workspaceId })
    await videoAudit(tx, {
      workspaceId: v.ws,
      actorId: user.id,
      videoId,
      action: "video.updated",
      metadata: { trim: true },
    })
  })
  await systemDb.insert(mediaJobs).values({ videoId, kind: "process" })
}

/** Use the frame at `atMs` as the thumbnail. The worker cuts it from the video. */
export async function setThumbnailAt(user: CurrentUser, videoId: string, atMs: number) {
  await requireRole(user, videoId, ["owner", "editor"])
  await withRls(user.claims, (tx) =>
    tx
      .update(videos)
      .set({ thumbnailAtMs: Math.max(0, Math.round(atMs)) })
      .where(eq(videos.id, videoId))
  )
  await systemDb.insert(mediaJobs).values({ videoId, kind: "thumbnail" })
}

export async function deleteVideo(user: CurrentUser, videoId: string) {
  await requireRole(user, videoId, ["owner"])
  const v = await withRls(user.claims, async (tx) => {
    const [row] = await tx.select().from(videos).where(eq(videos.id, videoId))
    await tx
      .update(videos)
      .set({ deletedAt: sql`now()` })
      .where(eq(videos.id, videoId))
    await videoAudit(tx, {
      workspaceId: row.workspaceId,
      actorId: user.id,
      videoId,
      action: "video.deleted",
      metadata: { title: row.title },
    })
    return row
  })
  await deleteObjects([
    v.originalKey,
    v.playbackKey ?? "",
    v.thumbnailKey ?? "",
    v.captionsKey ?? "",
  ])
}

// ── Sharing ─────────────────────────────────────────────────────────────────

export type GrantView = {
  id: string
  userId: string | null
  name: string
  email: string
  role: ItemRole
  isGuest: boolean
}

export async function listGrants(user: CurrentUser, videoId: string): Promise<GrantView[]> {
  await requireRole(user, videoId, ["owner", "editor", "viewer"])
  // Names and emails of people a video is shared with are visible to everyone who can see it.
  const rows = await systemDb
    .select({
      id: videoGrants.id,
      userId: videoGrants.userId,
      grantEmail: videoGrants.email,
      role: videoGrants.role,
      name: profiles.displayName,
      email: profiles.email,
      memberRole: workspaceMembers.role,
    })
    .from(videoGrants)
    .innerJoin(videos, eq(videos.id, videoGrants.videoId))
    .leftJoin(profiles, eq(profiles.id, videoGrants.userId))
    .leftJoin(
      workspaceMembers,
      and(
        eq(workspaceMembers.workspaceId, videos.workspaceId),
        eq(workspaceMembers.userId, videoGrants.userId)
      )
    )
    .where(eq(videoGrants.videoId, videoId))
    .orderBy(asc(videoGrants.createdAt))
  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    name: r.name ?? r.grantEmail ?? "Someone",
    email: (r.email ?? r.grantEmail ?? "") as string,
    role: r.role,
    isGuest: !r.memberRole || r.memberRole === "guest",
  }))
}

export async function shareVideo(
  user: CurrentUser,
  videoId: string,
  emails: string[],
  role: ItemRole
) {
  await requireRole(user, videoId, ["owner"])
  const unique = [...new Set(emails.map((e) => e.toLowerCase()))]
    .filter((e) => e !== user.email.toLowerCase())
    .slice(0, 50)
  if (unique.length === 0) return { added: 0 }

  // Match emails to existing accounts so the grant follows the person, not the address.
  const known = await systemDb
    .select({ id: profiles.id, email: profiles.email })
    .from(profiles)
    .where(inArray(sql`lower(${profiles.email})`, unique))
  const byEmail = new Map(known.map((k) => [k.email.toLowerCase(), k.id]))

  const video = await withRls(user.claims, async (tx) => {
    const [v] = await tx.select().from(videos).where(eq(videos.id, videoId))
    for (const email of unique) {
      const userId = byEmail.get(email)
      await tx
        .insert(videoGrants)
        .values(
          userId
            ? { videoId, userId, role, grantedBy: user.id }
            : { videoId, email, role, grantedBy: user.id }
        )
        .onConflictDoUpdate({
          target: userId
            ? [videoGrants.videoId, videoGrants.userId]
            : [videoGrants.videoId, videoGrants.email],
          targetWhere: userId ? sql`user_id is not null` : sql`email is not null`,
          set: { role },
        })
    }
    await videoAudit(tx, {
      workspaceId: v.workspaceId,
      actorId: user.id,
      videoId,
      action: "video.shared",
      metadata: { count: unique.length, role },
    })
    return v
  })

  const url = `${env.NEXT_PUBLIC_APP_URL}/v/${videoId}`
  await Promise.allSettled(
    unique.map((to) =>
      sendEmail({
        to,
        subject: `${user.displayName} shared a video with you`,
        text: `${user.displayName} shared "${video.title}" with you on Cloqui.\n\nWatch it: ${url}\n\nThe link only works when you sign in with this email address.`,
        html: `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5;color:#131a28;max-width:480px"><p><strong>${escapeHtml(user.displayName)}</strong> shared a video with you on Cloqui.</p><p><a href="${url}" style="display:inline-block;background:#0b7a60;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none">Watch the video</a></p><p style="color:#4f5b72;font-size:14px">The link only works when you sign in with this email address.</p></div>`,
      })
    )
  )
  return { added: unique.length }
}

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  )

export async function removeGrant(user: CurrentUser, videoId: string, grantId: string) {
  await requireRole(user, videoId, ["owner"])
  await withRls(user.claims, async (tx) => {
    const [g] = await tx
      .delete(videoGrants)
      .where(and(eq(videoGrants.id, grantId), eq(videoGrants.videoId, videoId)))
      .returning({ userId: videoGrants.userId, email: videoGrants.email })
    if (!g) throw new AccessDeniedError()
    const [v] = await tx
      .select({ ws: videos.workspaceId })
      .from(videos)
      .where(eq(videos.id, videoId))
    await videoAudit(tx, {
      workspaceId: v.ws,
      actorId: user.id,
      videoId,
      action: "video.unshared",
      metadata: { userId: g.userId, name: await personLabel(g.userId, g.email) },
    })
  })
}

export async function changeGrantRole(
  user: CurrentUser,
  videoId: string,
  grantId: string,
  role: ItemRole
) {
  await requireRole(user, videoId, ["owner"])
  await withRls(user.claims, async (tx) => {
    const rows = await tx
      .update(videoGrants)
      .set({ role })
      .where(and(eq(videoGrants.id, grantId), eq(videoGrants.videoId, videoId)))
      .returning({ id: videoGrants.id, userId: videoGrants.userId, email: videoGrants.email })
    if (rows.length === 0) throw new AccessDeniedError()
    const [v] = await tx
      .select({ ws: videos.workspaceId })
      .from(videos)
      .where(eq(videos.id, videoId))
    await videoAudit(tx, {
      workspaceId: v.ws,
      actorId: user.id,
      videoId,
      action: "video.role_changed",
      metadata: { role, name: await personLabel(rows[0].userId, rows[0].email) },
    })
  })
}

export type ShareSettings = {
  workspaceVisible: boolean
  accessExpiresAt: Date | null
  viewOnly: boolean
  watermark: boolean
}

export async function updateShareSettings(user: CurrentUser, videoId: string, s: ShareSettings) {
  await requireRole(user, videoId, ["owner"])
  await withRls(user.claims, async (tx) => {
    const [v] = await tx
      .update(videos)
      .set(s)
      .where(eq(videos.id, videoId))
      .returning({ ws: videos.workspaceId })
    await videoAudit(tx, {
      workspaceId: v.ws,
      actorId: user.id,
      videoId,
      action: "video.settings_changed",
      metadata: { ...s, accessExpiresAt: s.accessExpiresAt?.toISOString() ?? null },
    })
  })
}

/** Set (or clear with null) the passcode. Changing it locks everyone out until they enter the new one. */
export async function setPasscode(user: CurrentUser, videoId: string, passcode: string | null) {
  await requireRole(user, videoId, ["owner"])
  const hash = passcode ? await hashPasscode(passcode) : null
  await withRls(user.claims, async (tx) => {
    const [v] = await tx
      .update(videos)
      .set({ passcodeHash: hash, passcodeVersion: sql`${videos.passcodeVersion} + 1` })
      .where(eq(videos.id, videoId))
      .returning({ ws: videos.workspaceId })
    await videoAudit(tx, {
      workspaceId: v.ws,
      actorId: user.id,
      videoId,
      action: "video.settings_changed",
      metadata: { passcode: passcode ? "set" : "removed" },
    })
  })
}

export async function unlockWithPasscode(user: CurrentUser, videoId: string, passcode: string) {
  const role = await getVideoRole(user, videoId)
  if (!role) throw new AccessDeniedError()
  if (!(await takeToken("passcode", `${user.id}:${videoId}`))) {
    throw new UserFacingError("Too many tries. Wait a few minutes and try again.")
  }
  const [v] = await systemDb
    .select({ hash: videos.passcodeHash, version: videos.passcodeVersion, ws: videos.workspaceId })
    .from(videos)
    .where(eq(videos.id, videoId))
  if (!v?.hash) return
  if (!(await verifyPasscode(passcode, v.hash))) {
    await videoAudit(systemDb, {
      workspaceId: v.ws,
      actorId: user.id,
      videoId,
      action: "video.passcode_failed",
    })
    throw new UserFacingError("That passcode isn't right.")
  }
  await systemDb
    .insert(videoPasscodeUnlocks)
    .values({ videoId, userId: user.id, passcodeVersion: v.version })
    .onConflictDoUpdate({
      target: [videoPasscodeUnlocks.videoId, videoPasscodeUnlocks.userId],
      set: { passcodeVersion: v.version, unlockedAt: sql`now()` },
    })
}

// ── Access requests ─────────────────────────────────────────────────────────

export async function requestAccess(user: CurrentUser, videoId: string) {
  if (!(await takeToken("accessRequest", user.id))) {
    throw new UserFacingError("You've sent a lot of requests. Try again later.")
  }
  await withRls(user.claims, (tx) =>
    tx.execute(sql`select public.request_video_access(${videoId}::uuid)`)
  )
  // Tell the owner, if this created a real request. Read as system: the requester can't see the video.
  const [row] = await systemDb
    .select({ ownerEmail: profiles.email, title: videos.title, ws: videos.workspaceId })
    .from(videoAccessRequests)
    .innerJoin(videos, eq(videos.id, videoAccessRequests.videoId))
    .innerJoin(profiles, eq(profiles.id, videos.ownerId))
    .where(
      and(
        eq(videoAccessRequests.videoId, videoId),
        eq(videoAccessRequests.requesterId, user.id),
        eq(videoAccessRequests.status, "pending")
      )
    )
  if (!row) return
  await videoAudit(systemDb, {
    workspaceId: row.ws,
    actorId: user.id,
    videoId,
    action: "video.access_requested",
  })
  const url = `${env.NEXT_PUBLIC_APP_URL}/v/${videoId}`
  await sendEmail({
    to: row.ownerEmail,
    subject: `${user.displayName} asked to watch "${row.title}"`,
    text: `${user.displayName} (${user.email}) asked for access to "${row.title}".\n\nReview it: ${url}`,
    html: `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5;color:#131a28;max-width:480px"><p><strong>${escapeHtml(user.displayName)}</strong> (${escapeHtml(user.email)}) asked for access to <strong>${escapeHtml(row.title)}</strong>.</p><p><a href="${url}" style="display:inline-block;background:#0b7a60;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none">Review the request</a></p></div>`,
  }).catch(() => undefined)
}

export async function listAccessRequests(user: CurrentUser, videoId: string) {
  const role = await getVideoRole(user, videoId)
  if (role !== "owner") return []
  return systemDb
    .select({
      id: videoAccessRequests.id,
      requesterId: videoAccessRequests.requesterId,
      name: profiles.displayName,
      email: profiles.email,
      createdAt: videoAccessRequests.createdAt,
    })
    .from(videoAccessRequests)
    .innerJoin(profiles, eq(profiles.id, videoAccessRequests.requesterId))
    .where(and(eq(videoAccessRequests.videoId, videoId), eq(videoAccessRequests.status, "pending")))
    .orderBy(asc(videoAccessRequests.createdAt))
}

export async function resolveAccessRequest(
  user: CurrentUser,
  videoId: string,
  requestId: string,
  approve: boolean
) {
  await requireRole(user, videoId, ["owner"])
  await withRls(user.claims, async (tx) => {
    const [req] = await tx
      .update(videoAccessRequests)
      .set({
        status: approve ? "approved" : "declined",
        resolvedBy: user.id,
        resolvedAt: sql`now()`,
      })
      .where(
        and(
          eq(videoAccessRequests.id, requestId),
          eq(videoAccessRequests.videoId, videoId),
          eq(videoAccessRequests.status, "pending")
        )
      )
      .returning({ requesterId: videoAccessRequests.requesterId })
    if (!req) throw new AccessDeniedError()
    if (approve) {
      await tx
        .insert(videoGrants)
        .values({ videoId, userId: req.requesterId, role: "viewer", grantedBy: user.id })
        .onConflictDoNothing()
    }
    const [v] = await tx
      .select({ ws: videos.workspaceId })
      .from(videos)
      .where(eq(videos.id, videoId))
    await videoAudit(tx, {
      workspaceId: v.ws,
      actorId: user.id,
      videoId,
      action: approve ? "video.access_approved" : "video.access_declined",
      metadata: { userId: req.requesterId, name: await personLabel(req.requesterId) },
    })
  })
}

// ── Playback ────────────────────────────────────────────────────────────────

export type Playback = {
  src: string
  type: string
  poster: string | null
  captions: string | null
  expiresAt: number
}

/**
 * Short-lived URLs for one viewer. Checks role, expiry and passcode every time.
 * Logs a "viewed" event at most once per person per video every 30 minutes.
 */
export async function issuePlayback(user: CurrentUser, videoId: string): Promise<Playback> {
  const view = await getVideoView(user, videoId)
  if (view.kind !== "ok") throw new AccessDeniedError()
  const v = view.video
  const ttl = env.SIGNED_URL_TTL_SECONDS
  const useProcessed = v.status === "ready" && v.playbackKey
  const [src, poster, captions] = await Promise.all([
    presignRead(useProcessed ? v.playbackKey! : v.originalKey, { ttl }),
    v.thumbnailKey ? presignRead(v.thumbnailKey, { ttl }) : null,
    v.captionsKey ? presignRead(v.captionsKey, { ttl }) : null,
  ])
  if (view.role !== "owner" && (await takeToken("viewLog", `${user.id}:${videoId}`))) {
    await videoAudit(systemDb, {
      workspaceId: v.workspaceId,
      actorId: user.id,
      videoId,
      action: "video.viewed",
    })
  }
  return {
    src,
    type: useProcessed ? "video/mp4" : v.mimeType,
    poster,
    captions,
    expiresAt: Date.now() + ttl * 1000,
  }
}

export async function downloadUrl(user: CurrentUser, videoId: string) {
  const view = await getVideoView(user, videoId)
  if (view.kind !== "ok") throw new AccessDeniedError()
  if (view.video.viewOnly && view.role === "viewer") throw new AccessDeniedError()
  const v = view.video
  const key = v.status === "ready" && v.playbackKey ? v.playbackKey : v.originalKey
  const ext = key.split(".").pop()
  const safe =
    v.title
      .replace(/[^a-z0-9 _-]/gi, "")
      .trim()
      .slice(0, 60) || "video"
  return presignRead(key, { ttl: 60, filename: `${safe}.${ext}` })
}

// ── Comments and reactions ──────────────────────────────────────────────────

export async function listComments(user: CurrentUser, videoId: string) {
  return withRls(user.claims, (tx) =>
    tx
      .select({
        id: videoComments.id,
        body: videoComments.body,
        atMs: videoComments.atMs,
        createdAt: videoComments.createdAt,
        authorId: videoComments.authorId,
        authorName: sql<string>`coalesce((select display_name from public.profiles p where p.id = ${videoComments.authorId}), 'Someone')`,
      })
      .from(videoComments)
      .where(and(eq(videoComments.videoId, videoId), isNull(videoComments.deletedAt)))
      .orderBy(sql`${videoComments.atMs} nulls last`, asc(videoComments.createdAt))
  )
}

export async function addComment(
  user: CurrentUser,
  videoId: string,
  body: string,
  atMs: number | null
) {
  await requireRole(user, videoId, ["owner", "editor", "viewer"])
  await withRls(user.claims, (tx) =>
    tx.insert(videoComments).values({ videoId, authorId: user.id, body, atMs })
  )
}

export async function deleteComment(user: CurrentUser, videoId: string, commentId: string) {
  await withRls(user.claims, async (tx) => {
    const rows = await tx
      .update(videoComments)
      .set({ deletedAt: sql`now()` })
      .where(
        and(
          eq(videoComments.id, commentId),
          eq(videoComments.videoId, videoId),
          eq(videoComments.authorId, user.id)
        )
      )
      .returning({ id: videoComments.id })
    if (rows.length === 0) throw new AccessDeniedError()
  })
}

export async function listReactions(user: CurrentUser, videoId: string) {
  const rows = await withRls(user.claims, (tx) =>
    tx
      .select({
        emoji: videoReactions.emoji,
        count: sql<number>`count(*)::int`,
        mine: sql<boolean>`bool_or(${videoReactions.userId} = ${user.id})`,
      })
      .from(videoReactions)
      .where(eq(videoReactions.videoId, videoId))
      .groupBy(videoReactions.emoji)
  )
  return rows
}

export async function toggleReaction(
  user: CurrentUser,
  videoId: string,
  emoji: ReactionEmoji,
  atMs: number | null
) {
  await requireRole(user, videoId, ["owner", "editor", "viewer"])
  await withRls(user.claims, async (tx) => {
    const removed = await tx
      .delete(videoReactions)
      .where(
        and(
          eq(videoReactions.videoId, videoId),
          eq(videoReactions.userId, user.id),
          eq(videoReactions.emoji, emoji)
        )
      )
      .returning({ id: videoReactions.id })
    if (removed.length === 0)
      await tx.insert(videoReactions).values({ videoId, userId: user.id, emoji, atMs })
  })
}

// ── Item audit ──────────────────────────────────────────────────────────────

/** Who viewed and who changed sharing. Owners and workspace admins only. */
export async function listVideoActivity(user: CurrentUser, videoId: string) {
  // RLS decides which events this person may read (owner or workspace admin).
  const rows = await withRls(user.claims, (tx) =>
    tx
      .select({
        id: auditEvents.id,
        action: auditEvents.action,
        metadata: auditEvents.metadata,
        createdAt: auditEvents.createdAt,
        actorId: auditEvents.actorId,
      })
      .from(auditEvents)
      .where(and(eq(auditEvents.targetType, "video"), eq(auditEvents.targetId, videoId)))
      .orderBy(desc(auditEvents.createdAt))
      .limit(200)
  )
  // Guests aren't workspace members, so their profiles are hidden by RLS. The owner let them in,
  // so naming the people in this video's own activity log is fine. Resolve only those ids.
  const ids = [...new Set(rows.map((r) => r.actorId).filter((x): x is string => !!x))]
  const names = ids.length
    ? new Map(
        (
          await systemDb
            .select({ id: profiles.id, name: profiles.displayName })
            .from(profiles)
            .where(inArray(profiles.id, ids))
        ).map((p) => [p.id, p.name])
      )
    : new Map<string, string>()
  return rows.map(({ actorId, ...r }) => ({
    ...r,
    actorName: (actorId && names.get(actorId)) || "Someone",
  }))
}

/** Display name (or email for not-yet-registered people) of a grant's subject, for audit metadata. */
async function personLabel(userId: string | null, email?: string | null) {
  if (!userId) return email ?? "someone"
  const [p] = await systemDb
    .select({ name: profiles.displayName })
    .from(profiles)
    .where(eq(profiles.id, userId))
  return p?.name ?? "someone"
}

export async function canSeeVideoActivity(user: CurrentUser, videoId: string, workspaceId: string) {
  const role = await getVideoRole(user, videoId)
  if (role === "owner") return true
  const [m] = await withRls(user.claims, (tx) =>
    tx
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, user.id))
      )
  )
  return m?.role === "owner" || m?.role === "admin"
}

// Workspace members a video can be shared with (for the share box suggestions).
export async function shareSuggestions(user: CurrentUser, videoId: string) {
  const role = await getVideoRole(user, videoId)
  if (role !== "owner") return []
  const [v] = await systemDb
    .select({ ws: videos.workspaceId })
    .from(videos)
    .where(eq(videos.id, videoId))
  return withRls(user.claims, (tx) =>
    tx
      .select({ id: profiles.id, name: profiles.displayName, email: profiles.email })
      .from(workspaceMembers)
      .innerJoin(profiles, eq(profiles.id, workspaceMembers.userId))
      .where(
        and(
          eq(workspaceMembers.workspaceId, v.ws),
          sql`${workspaceMembers.userId} <> ${user.id}`,
          or(
            eq(workspaceMembers.role, "owner"),
            eq(workspaceMembers.role, "admin"),
            eq(workspaceMembers.role, "member")
          )
        )
      )
      .orderBy(asc(profiles.displayName))
  )
}
