import "server-only"
import { randomBytes } from "node:crypto"
import { and, eq, gt, sql } from "drizzle-orm"
import { headers } from "next/headers"
import { env } from "@/lib/env"
import type { CurrentUser } from "@/server/auth"
import { audit } from "@/server/audit"
import { AccessDeniedError, authorize } from "@/server/authz"
import { systemDb, withRls } from "@/server/db"
import {
  profiles,
  videoPublicLinks,
  videoPublicUnlocks,
  videos,
  workspaces,
} from "@/server/db/schema"
import { verifyPasscode } from "@/server/media/passcode"
import { takeToken } from "@/server/rate-limit"
import { hashToken } from "@/server/tokens"
import { getVideoRole, presignPlayback, videoAudit, type Playback } from "@/server/videos"
import { UserFacingError } from "@/server/workspaces"

// Opt-in public links for videos. The owner turns one on; workspace admins can block them.
// Signed-in access (src/server/videos.ts) is unchanged: this is a second, narrower door that
// only ever plays the video. No comments, reactions, downloads or names of other viewers.

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/
const UNLOCK_HOURS = 12

export const isPublicToken = (t: string) => TOKEN_RE.test(t)
export const publicUrl = (token: string) => `${env.NEXT_PUBLIC_APP_URL}/p/${token}`

// ── For the owner ───────────────────────────────────────────────────────────

export type PublicLinkState = { url: string | null; allowed: boolean }

/** The owner's view of the public link. Everyone else gets null: they never see the link. */
export async function getPublicLinkState(
  user: CurrentUser,
  videoId: string
): Promise<PublicLinkState | null> {
  if ((await getVideoRole(user, videoId)) !== "owner") return null
  return withRls(user.claims, async (tx) => {
    const [row] = await tx
      .select({ token: videoPublicLinks.token })
      .from(videoPublicLinks)
      .where(eq(videoPublicLinks.videoId, videoId))
    const [ok] = await tx.execute<{ allowed: boolean }>(
      sql`select public.public_links_allowed(${videoId}::uuid) as allowed`
    )
    const allowed = ok?.allowed === true
    return { url: row && allowed ? publicUrl(row.token) : null, allowed }
  })
}

/** Whether a video has a working public link. Anyone who can see the video may know this. */
export async function hasPublicLink(user: CurrentUser, videoId: string) {
  const [row] = await withRls(user.claims, (tx) =>
    tx.execute<{ enabled: boolean }>(
      sql`select public.has_public_link(${videoId}::uuid) as enabled`
    )
  )
  return row?.enabled === true
}

/** Turn the public link on (a new link every time) or off. Owner only. */
export async function setPublicLink(user: CurrentUser, videoId: string, on: boolean) {
  if ((await getVideoRole(user, videoId)) !== "owner") throw new AccessDeniedError()
  return withRls(user.claims, async (tx) => {
    const [v] = await tx
      .select({ ws: videos.workspaceId })
      .from(videos)
      .where(eq(videos.id, videoId))
    if (!v) throw new AccessDeniedError()
    await tx.delete(videoPublicLinks).where(eq(videoPublicLinks.videoId, videoId))
    let url: string | null = null
    if (on) {
      const [ok] = await tx.execute<{ allowed: boolean }>(
        sql`select public.public_links_allowed(${videoId}::uuid) as allowed`
      )
      if (!ok?.allowed) {
        throw new UserFacingError("Your workspace admins have turned off public links.")
      }
      const token = randomBytes(32).toString("base64url")
      await tx.insert(videoPublicLinks).values({ videoId, token, createdBy: user.id })
      url = publicUrl(token)
    }
    await videoAudit(tx, {
      workspaceId: v.ws,
      actorId: user.id,
      videoId,
      action: on ? "video.public_link_on" : "video.public_link_off",
    })
    return url
  })
}

// ── For workspace admins ────────────────────────────────────────────────────

/** Block or allow public links for the whole workspace. Blocking deletes every existing link. */
export async function setAllowPublicLinks(user: CurrentUser, slug: string, allow: boolean) {
  const { workspace } = await authorize(user, "workspace.update", slug)
  await withRls(user.claims, (tx) =>
    tx.update(workspaces).set({ allowPublicLinks: allow }).where(eq(workspaces.id, workspace.id))
  )
  // Links stop working the moment the flag is off (public_video_id checks it). Deleting them
  // means allowing links again later doesn't bring old ones back. As system: an admin can't
  // see other people's private videos under RLS, but their links must go too.
  let removed = 0
  if (!allow) {
    const gone = await systemDb
      .delete(videoPublicLinks)
      .where(
        sql`${videoPublicLinks.videoId} in (select id from public.videos where workspace_id = ${workspace.id})`
      )
      .returning({ id: videoPublicLinks.videoId })
    removed = gone.length
  }
  return withRls(user.claims, async (tx) => {
    await audit(tx, {
      workspaceId: workspace.id,
      actorId: user.id,
      action: allow ? "security.public_links_allowed" : "security.public_links_blocked",
      targetType: "workspace",
      targetId: workspace.id,
      metadata: allow ? {} : { removed },
    })
    return removed
  })
}

/** How many videos in the workspace have a working public link. Admins only. */
export async function countPublicLinks(user: CurrentUser, slug: string) {
  const { workspace } = await authorize(user, "workspace.update", slug)
  // Admins can't read other people's links under RLS, and only need the number.
  const [row] = await systemDb.execute<{ n: number }>(sql`
    select count(*)::int as n from public.video_public_links l
    join public.videos v on v.id = l.video_id
    where v.workspace_id = ${workspace.id} and v.deleted_at is null`)
  return row?.n ?? 0
}

// ── For people opening a public link (not signed in) ────────────────────────

export type PublicView =
  | { kind: "none" }
  | { kind: "passcode"; ownerFirstName: string }
  | {
      kind: "ok"
      title: string
      description: string
      ownerFirstName: string
      createdAt: Date
      durationMs: number | null
      playback: Playback
    }

/** A key for rate limits and view logs: a hash of the visitor's IP, never the IP itself. */
export async function visitorKey() {
  const h = await headers()
  // Cloud Run's front end appends the real client address last; earlier entries can be forged.
  const forwarded = h.get("x-forwarded-for")?.split(",").at(-1)?.trim()
  return hashToken(forwarded || h.get("x-real-ip") || "local").slice(0, 32)
}

async function resolve(token: string) {
  if (!isPublicToken(token)) return null
  const [row] = await systemDb.execute<{ id: string | null }>(
    sql`select public.public_video_id(${token}) as id`
  )
  if (!row?.id) return null
  const [v] = await systemDb
    .select({
      id: videos.id,
      workspaceId: videos.workspaceId,
      title: videos.title,
      description: videos.description,
      createdAt: videos.createdAt,
      durationMs: videos.durationMs,
      status: videos.status,
      mimeType: videos.mimeType,
      originalKey: videos.originalKey,
      playbackKey: videos.playbackKey,
      thumbnailKey: videos.thumbnailKey,
      captionsKey: videos.captionsKey,
      passcodeHash: videos.passcodeHash,
      passcodeVersion: videos.passcodeVersion,
      ownerName: profiles.displayName,
    })
    .from(videos)
    .leftJoin(profiles, eq(profiles.id, videos.ownerId))
    .where(eq(videos.id, row.id))
  return v ?? null
}

async function unlocked(videoId: string, version: number, unlock: string | null | undefined) {
  if (!unlock || unlock.length > 100) return false
  const [row] = await systemDb
    .select({ v: videoPublicUnlocks.passcodeVersion })
    .from(videoPublicUnlocks)
    .where(
      and(
        eq(videoPublicUnlocks.tokenHash, hashToken(unlock)),
        eq(videoPublicUnlocks.videoId, videoId),
        gt(videoPublicUnlocks.expiresAt, sql`now()`)
      )
    )
  return row?.v === version
}

/**
 * Everything the public page needs. Every call re-checks the link, so turning it off, an
 * admin block, the access end date, a new passcode or deleting the video stops it at once.
 */
export async function getPublicView(token: string, unlock?: string | null): Promise<PublicView> {
  const v = await resolve(token)
  if (!v) return { kind: "none" }
  const ownerFirstName = (v.ownerName ?? "Someone").split(" ")[0]
  if (v.passcodeHash && !(await unlocked(v.id, v.passcodeVersion, unlock))) {
    return { kind: "passcode", ownerFirstName }
  }
  const playback = await presignPlayback(v)
  const visitor = await visitorKey()
  if (await takeToken("viewLog", `pub:${visitor}:${v.id}`)) {
    await videoAudit(systemDb, {
      workspaceId: v.workspaceId,
      actorId: null,
      videoId: v.id,
      action: "video.viewed_public",
    })
  }
  return {
    kind: "ok",
    title: v.title,
    description: v.description,
    ownerFirstName,
    createdAt: v.createdAt,
    durationMs: v.durationMs,
    playback,
  }
}

/** Check a passcode typed on the public page. Returns an unlock token for this tab. */
export async function unlockPublic(token: string, passcode: string): Promise<string> {
  const v = await resolve(token)
  if (!v) throw new AccessDeniedError()
  if (!v.passcodeHash) return ""
  const visitor = await visitorKey()
  if (!(await takeToken("passcode", `pub:${visitor}:${v.id}`))) {
    throw new UserFacingError("Too many tries. Wait a few minutes and try again.")
  }
  if (!(await verifyPasscode(passcode, v.passcodeHash))) {
    await videoAudit(systemDb, {
      workspaceId: v.workspaceId,
      actorId: null,
      videoId: v.id,
      action: "video.passcode_failed",
      metadata: { publicLink: true },
    })
    throw new UserFacingError("That passcode isn't right.")
  }
  const unlock = randomBytes(32).toString("base64url")
  await systemDb.insert(videoPublicUnlocks).values({
    tokenHash: hashToken(unlock),
    videoId: v.id,
    passcodeVersion: v.passcodeVersion,
    expiresAt: sql`now() + make_interval(hours => ${UNLOCK_HOURS})`,
  })
  // Old unlocks for this video are useless after they expire.
  await systemDb
    .delete(videoPublicUnlocks)
    .where(and(eq(videoPublicUnlocks.videoId, v.id), sql`${videoPublicUnlocks.expiresAt} < now()`))
  return unlock
}
