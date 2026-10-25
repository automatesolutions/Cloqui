import "server-only"
import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm"
import { AccessToken, RoomServiceClient, TrackSource } from "livekit-server-sdk"
import { env } from "@/lib/env"
import type { CurrentUser } from "@/server/auth"
import { AccessDeniedError, authorize } from "@/server/authz"
import { systemDb, withRls, type Tx } from "@/server/db"
import {
  auditEvents,
  liveRoomAdmissions,
  liveRoomInvites,
  liveRooms,
  profiles,
  workspaceMembers,
  workspaces,
  type AdmissionStatus,
  type LiveRole,
} from "@/server/db/schema"
import { sendEmail } from "@/server/email"
import { UserFacingError } from "@/server/workspaces"

// Rooms use the LiveKit room name = our room id. Tokens are minted only by tokenFor().
const TOKEN_TTL = "10m"
const LIVE_WINDOW_MS = 2 * 60 * 1000

let roomService: RoomServiceClient | null = null
function livekit() {
  roomService ??= new RoomServiceClient(
    env.NEXT_PUBLIC_LIVEKIT_URL.replace(/^ws/, "http"),
    env.LIVEKIT_API_KEY,
    env.LIVEKIT_API_SECRET
  )
  return roomService
}

type LiveAuditAction =
  | "live.created"
  | "live.invited"
  | "live.admitted"
  | "live.denied"
  | "live.removed"
  | "live.locked"
  | "live.unlocked"
  | "live.muted_all"
  | "live.ended"

async function liveAudit(
  tx: Tx | typeof systemDb,
  e: {
    workspaceId: string
    actorId: string
    roomId: string
    action: LiveAuditAction
    metadata?: Record<string, unknown>
  }
) {
  await tx.insert(auditEvents).values({
    workspaceId: e.workspaceId,
    actorId: e.actorId,
    action: e.action,
    targetType: "live_room",
    targetId: e.roomId,
    metadata: e.metadata ?? {},
  })
}

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  )

// ── Access ──────────────────────────────────────────────────────────────────

export async function getLiveRole(user: CurrentUser, roomId: string): Promise<LiveRole | null> {
  const rows = await withRls(user.claims, (tx) =>
    tx.execute<{ role: LiveRole | null }>(
      sql`select public.live_room_role(${roomId}::uuid) as role`
    )
  )
  return rows[0]?.role ?? null
}

async function requireManager(user: CurrentUser, roomId: string) {
  const role = await getLiveRole(user, roomId)
  if (role !== "host" && role !== "cohost") throw new AccessDeniedError()
  const [room] = await withRls(user.claims, (tx) =>
    tx.select().from(liveRooms).where(eq(liveRooms.id, roomId))
  )
  return { role, room }
}

export type LiveRoomView =
  | { kind: "denied" }
  | { kind: "ended"; title: string }
  | {
      kind: "ok"
      role: LiveRole
      room: typeof liveRooms.$inferSelect
      hostName: string
      workspace: { name: string; slug: string; isMember: boolean }
    }

export async function getLiveRoomView(user: CurrentUser, roomId: string): Promise<LiveRoomView> {
  const role = await getLiveRole(user, roomId)
  if (!role) {
    // An ended room the person was part of says so; anything else is a calm "no access".
    const [ended] = await withRls(user.claims, (tx) =>
      tx
        .select({ title: liveRooms.title, hostId: liveRooms.hostId, status: liveRooms.status })
        .from(liveRooms)
        .where(eq(liveRooms.id, roomId))
    )
    if (ended?.status === "ended") return { kind: "ended", title: ended.title }
    return { kind: "denied" }
  }
  const [room] = await withRls(user.claims, (tx) =>
    tx.select().from(liveRooms).where(eq(liveRooms.id, roomId))
  )
  const [ws] = await systemDb
    .select({ name: workspaces.name, slug: workspaces.slug })
    .from(workspaces)
    .where(eq(workspaces.id, room.workspaceId))
  const [host] = await systemDb
    .select({ name: profiles.displayName })
    .from(profiles)
    .where(eq(profiles.id, room.hostId))
  const [member] = await withRls(user.claims, (tx) =>
    tx
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, room.workspaceId),
          eq(workspaceMembers.userId, user.id)
        )
      )
  )
  return {
    kind: "ok",
    role,
    room,
    hostName: host?.name ?? "The host",
    workspace: { name: ws.name, slug: ws.slug, isMember: !!member && member.role !== "guest" },
  }
}

// ── Creating and listing ────────────────────────────────────────────────────

export async function createLiveRoom(
  user: CurrentUser,
  slug: string,
  input: { title: string; emails: string[]; waitingRoom: boolean; workspaceVisible: boolean }
) {
  const { workspace } = await authorize(user, "workspace.view", slug)
  const id = await withRls(user.claims, async (tx) => {
    const [room] = await tx
      .insert(liveRooms)
      .values({
        workspaceId: workspace.id,
        hostId: user.id,
        title: input.title,
        waitingRoom: input.waitingRoom,
        workspaceVisible: input.workspaceVisible,
      })
      .returning({ id: liveRooms.id })
    await liveAudit(tx, {
      workspaceId: workspace.id,
      actorId: user.id,
      roomId: room.id,
      action: "live.created",
    })
    return room.id
  })
  if (input.emails.length) await inviteToRoom(user, id, input.emails, "participant")
  return id
}

export async function inviteToRoom(
  user: CurrentUser,
  roomId: string,
  emails: string[],
  role: "cohost" | "participant"
) {
  const { room } = await requireManager(user, roomId)
  const unique = [...new Set(emails.map((e) => e.toLowerCase()))]
    .filter((e) => e !== user.email.toLowerCase())
    .slice(0, 50)
  if (unique.length === 0) return 0
  const known = await systemDb
    .select({ id: profiles.id, email: profiles.email })
    .from(profiles)
    .where(inArray(sql`lower(${profiles.email})`, unique))
  const byEmail = new Map(known.map((k) => [k.email.toLowerCase(), k.id]))
  await withRls(user.claims, async (tx) => {
    for (const email of unique) {
      const userId = byEmail.get(email)
      await tx
        .insert(liveRoomInvites)
        .values(
          userId
            ? { roomId, userId, role, invitedBy: user.id }
            : { roomId, email, role, invitedBy: user.id }
        )
        .onConflictDoUpdate({
          target: userId
            ? [liveRoomInvites.roomId, liveRoomInvites.userId]
            : [liveRoomInvites.roomId, liveRoomInvites.email],
          targetWhere: userId ? sql`user_id is not null` : sql`email is not null`,
          set: { role },
        })
    }
    await liveAudit(tx, {
      workspaceId: room.workspaceId,
      actorId: user.id,
      roomId,
      action: "live.invited",
      metadata: { count: unique.length },
    })
  })
  const url = `${env.NEXT_PUBLIC_APP_URL}/live/${roomId}`
  await Promise.allSettled(
    unique.map((to) =>
      sendEmail({
        to,
        subject: `${user.displayName} invited you to a live room`,
        text: `${user.displayName} invited you to "${room.title}" on Cloqui.\n\nJoin: ${url}\n\nThe link only works when you sign in with this email address.`,
        html: `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5;color:#131a28;max-width:480px"><p><strong>${escapeHtml(user.displayName)}</strong> invited you to a live room on Cloqui.</p><p><a href="${url}" style="display:inline-block;background:#0b7a60;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none">Join the room</a></p><p style="color:#4f5b72;font-size:14px">The link only works when you sign in with this email address.</p></div>`,
      })
    )
  )
  return unique.length
}

export async function listLiveRooms(user: CurrentUser, slug: string) {
  const { workspace } = await authorize(user, "workspace.view", slug)
  const rows = await withRls(user.claims, (tx) =>
    tx
      .select({
        id: liveRooms.id,
        title: liveRooms.title,
        hostId: liveRooms.hostId,
        lastActiveAt: liveRooms.lastActiveAt,
        createdAt: liveRooms.createdAt,
        locked: liveRooms.locked,
        workspaceVisible: liveRooms.workspaceVisible,
        invited: sql<number>`(select count(*)::int from public.live_room_invites i where i.room_id = ${liveRooms.id})`,
      })
      .from(liveRooms)
      .where(and(eq(liveRooms.workspaceId, workspace.id), eq(liveRooms.status, "open")))
      .orderBy(desc(liveRooms.createdAt))
      .limit(50)
  )
  const hostIds = [...new Set(rows.map((r) => r.hostId))]
  const hosts = hostIds.length
    ? new Map(
        (
          await systemDb
            .select({ id: profiles.id, name: profiles.displayName })
            .from(profiles)
            .where(inArray(profiles.id, hostIds))
        ).map((p) => [p.id, p.name])
      )
    : new Map<string, string>()
  const now = Date.now()
  return rows.map((r) => ({
    ...r,
    hostName: hosts.get(r.hostId) ?? "Someone",
    isLive: !!r.lastActiveAt && now - r.lastActiveAt.getTime() < LIVE_WINDOW_MS,
  }))
}

// ── Joining: the only place a LiveKit token is minted ───────────────────────

export type JoinResult =
  | { status: "waiting" | "denied" | "removed" | "locked" | "no_access" }
  | { status: "admitted"; token: string; url: string; role: LiveRole }

export async function tokenFor(user: CurrentUser, roomId: string): Promise<JoinResult> {
  const role = await getLiveRole(user, roomId)
  if (!role) return { status: "no_access" }
  const [room] = await withRls(user.claims, (tx) =>
    tx.select().from(liveRooms).where(eq(liveRooms.id, roomId))
  )
  const isManager = role === "host" || role === "cohost"

  if (!isManager) {
    const [existing] = await withRls(user.claims, (tx) =>
      tx
        .select({ status: liveRoomAdmissions.status })
        .from(liveRoomAdmissions)
        .where(and(eq(liveRoomAdmissions.roomId, roomId), eq(liveRoomAdmissions.userId, user.id)))
    )
    // A locked room keeps out anyone who isn't already admitted.
    if (room.locked && existing?.status !== "admitted") return { status: "locked" }
    const [r] = await withRls(user.claims, (tx) =>
      tx.execute<{ status: AdmissionStatus | null }>(
        sql`select public.request_live_admission(${roomId}::uuid) as status`
      )
    )
    const status = r?.status
    if (status !== "admitted") return { status: status ?? "no_access" }
  }

  const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
    identity: user.id,
    name: user.displayName,
    ttl: TOKEN_TTL,
    metadata: JSON.stringify({ role }),
  })
  at.addGrant({
    room: roomId,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    roomAdmin: isManager,
    canPublishSources: [
      TrackSource.CAMERA,
      TrackSource.MICROPHONE,
      TrackSource.SCREEN_SHARE,
      TrackSource.SCREEN_SHARE_AUDIO,
    ],
  })
  await systemDb
    .update(liveRooms)
    .set({ lastActiveAt: sql`now()` })
    .where(eq(liveRooms.id, roomId))
  return { status: "admitted", token: await at.toJwt(), url: env.NEXT_PUBLIC_LIVEKIT_URL, role }
}

/** Called by connected clients every minute so "Live now" stays accurate. */
export async function heartbeat(user: CurrentUser, roomId: string) {
  if (!(await getLiveRole(user, roomId))) return
  await systemDb
    .update(liveRooms)
    .set({ lastActiveAt: sql`now()` })
    .where(eq(liveRooms.id, roomId))
}

// ── Host controls ───────────────────────────────────────────────────────────

export async function listWaiting(user: CurrentUser, roomId: string) {
  await requireManager(user, roomId)
  const rows = await withRls(user.claims, (tx) =>
    tx
      .select({ userId: liveRoomAdmissions.userId, updatedAt: liveRoomAdmissions.updatedAt })
      .from(liveRoomAdmissions)
      .where(and(eq(liveRoomAdmissions.roomId, roomId), eq(liveRoomAdmissions.status, "waiting")))
      .orderBy(liveRoomAdmissions.updatedAt)
  )
  if (rows.length === 0) return []
  // These people were invited by the host, so naming them to the host is fine.
  const people = await systemDb
    .select({ id: profiles.id, name: profiles.displayName, email: profiles.email })
    .from(profiles)
    .where(
      inArray(
        profiles.id,
        rows.map((r) => r.userId)
      )
    )
  const byId = new Map(people.map((p) => [p.id, p]))
  return rows.map((r) => ({
    userId: r.userId,
    name: byId.get(r.userId)?.name ?? "Someone",
    email: byId.get(r.userId)?.email ?? "",
  }))
}

export async function decideAdmission(
  user: CurrentUser,
  roomId: string,
  targetId: string,
  admit: boolean
) {
  const { room } = await requireManager(user, roomId)
  await withRls(user.claims, async (tx) => {
    const rows = await tx
      .update(liveRoomAdmissions)
      .set({ status: admit ? "admitted" : "denied", decidedBy: user.id, updatedAt: sql`now()` })
      .where(
        and(
          eq(liveRoomAdmissions.roomId, roomId),
          eq(liveRoomAdmissions.userId, targetId),
          eq(liveRoomAdmissions.status, "waiting")
        )
      )
      .returning({ userId: liveRoomAdmissions.userId })
    if (rows.length === 0) throw new UserFacingError("They're no longer waiting.")
    await liveAudit(tx, {
      workspaceId: room.workspaceId,
      actorId: user.id,
      roomId,
      action: admit ? "live.admitted" : "live.denied",
      metadata: { userId: targetId },
    })
  })
}

/** Remove someone now. They're disconnected and can't come back to this room. */
export async function removeFromRoom(user: CurrentUser, roomId: string, targetId: string) {
  const { room } = await requireManager(user, roomId)
  if (targetId === room.hostId || targetId === user.id) throw new AccessDeniedError()
  await systemDb
    .insert(liveRoomAdmissions)
    .values({ roomId, userId: targetId, status: "removed", decidedBy: user.id })
    .onConflictDoUpdate({
      target: [liveRoomAdmissions.roomId, liveRoomAdmissions.userId],
      set: { status: "removed", decidedBy: user.id, updatedAt: sql`now()` },
    })
  await liveAudit(systemDb, {
    workspaceId: room.workspaceId,
    actorId: user.id,
    roomId,
    action: "live.removed",
    metadata: { userId: targetId },
  })
  await livekit()
    .removeParticipant(roomId, targetId)
    .catch(() => undefined) // Not connected right now is fine.
}

export async function setRoomLocked(user: CurrentUser, roomId: string, locked: boolean) {
  const { room } = await requireManager(user, roomId)
  await withRls(user.claims, async (tx) => {
    await tx.update(liveRooms).set({ locked }).where(eq(liveRooms.id, roomId))
    await liveAudit(tx, {
      workspaceId: room.workspaceId,
      actorId: user.id,
      roomId,
      action: locked ? "live.locked" : "live.unlocked",
    })
  })
}

export async function muteEveryone(user: CurrentUser, roomId: string) {
  const { room } = await requireManager(user, roomId)
  const participants = await livekit()
    .listParticipants(roomId)
    .catch(() => [])
  let muted = 0
  for (const p of participants) {
    if (p.identity === user.id) continue
    for (const t of p.tracks) {
      if (t.source === TrackSource.MICROPHONE && !t.muted) {
        await livekit()
          .mutePublishedTrack(roomId, p.identity, t.sid, true)
          .catch(() => undefined)
        muted++
      }
    }
  }
  await liveAudit(systemDb, {
    workspaceId: room.workspaceId,
    actorId: user.id,
    roomId,
    action: "live.muted_all",
    metadata: { muted },
  })
  return muted
}

export async function endRoom(user: CurrentUser, roomId: string) {
  const { room, role } = await requireManager(user, roomId)
  if (role !== "host") throw new AccessDeniedError()
  await withRls(user.claims, async (tx) => {
    await tx
      .update(liveRooms)
      .set({ status: "ended", endedAt: sql`now()` })
      .where(eq(liveRooms.id, roomId))
    await liveAudit(tx, {
      workspaceId: room.workspaceId,
      actorId: user.id,
      roomId,
      action: "live.ended",
    })
  })
  await livekit()
    .deleteRoom(roomId)
    .catch(() => undefined)
}

/** Open rooms with someone connected in the last 2 minutes, for Home. */
export async function liveNow(user: CurrentUser, slug: string) {
  const { workspace } = await authorize(user, "workspace.view", slug)
  return withRls(user.claims, (tx) =>
    tx
      .select({ id: liveRooms.id, title: liveRooms.title })
      .from(liveRooms)
      .where(
        and(
          eq(liveRooms.workspaceId, workspace.id),
          eq(liveRooms.status, "open"),
          isNull(liveRooms.endedAt),
          gt(liveRooms.lastActiveAt, sql`now() - interval '2 minutes'`)
        )
      )
      .orderBy(desc(liveRooms.lastActiveAt))
      .limit(5)
  )
}
