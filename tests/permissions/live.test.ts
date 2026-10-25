import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { sql } from "drizzle-orm"
import type { CurrentUser } from "@/server/auth"
import { AccessDeniedError } from "@/server/authz"
import { systemDb } from "@/server/db"
import {
  createLiveRoom,
  decideAdmission,
  endRoom,
  getLiveRole,
  inviteToRoom,
  listWaiting,
  removeFromRoom,
  setRoomLocked,
  tokenFor,
  type JoinResult,
} from "@/server/live"
import { createWorkspace } from "@/server/workspaces"
import {
  addMember,
  attempt,
  cleanupUsers,
  makeUser,
  runId,
  visibleCount,
  wsIdBySlug,
} from "./helpers"

const slug = `live-${runId}`
let host: CurrentUser,
  cohost: CurrentUser,
  guestP: CurrentUser,
  colleague: CurrentUser,
  outsider: CurrentUser
let roomId: string

function claimsOf(r: JoinResult) {
  if (r.status !== "admitted") throw new Error(`expected a token, got ${r.status}`)
  return JSON.parse(Buffer.from(r.token.split(".")[1], "base64url").toString()) as {
    sub: string
    video: { room: string; roomJoin: boolean; roomAdmin?: boolean }
  }
}

beforeAll(async () => {
  ;[host, cohost, guestP, colleague, outsider] = await Promise.all([
    makeUser("l-host"),
    makeUser("l-cohost"),
    makeUser("l-guest", "guest.example"),
    makeUser("l-colleague"),
    makeUser("l-outsider"),
  ])
  await createWorkspace(host, "Live", slug)
  const ws = await wsIdBySlug(slug)
  await addMember(ws, cohost.id, "member")
  await addMember(ws, colleague.id, "member")
  roomId = await createLiveRoom(host, slug, {
    title: "Standup",
    emails: [guestP.email],
    waitingRoom: true,
    workspaceVisible: false,
  })
  await inviteToRoom(host, roomId, [cohost.email], "cohost")
})

afterAll(async () => {
  await systemDb.execute(sql`delete from public.workspaces where slug = ${slug}`)
  await cleanupUsers()
})

describe("joining a live room", () => {
  it("an uninvited person gets no token, even a colleague", async () => {
    expect(await tokenFor(outsider, roomId)).toEqual({ status: "no_access" })
    expect(await tokenFor(colleague, roomId)).toEqual({ status: "no_access" })
    expect(await visibleCount(colleague, "live_rooms", `id = '${roomId}'`)).toBe(0)
  })

  it("the host and co-host get admin tokens for exactly this room", async () => {
    const h = claimsOf(await tokenFor(host, roomId))
    expect(h.video).toMatchObject({ room: roomId, roomJoin: true, roomAdmin: true })
    expect(h.sub).toBe(host.id)
    expect(claimsOf(await tokenFor(cohost, roomId)).video.roomAdmin).toBe(true)
  })

  it("an invited guest waits until the host admits them, and gets no admin rights", async () => {
    expect(await tokenFor(guestP, roomId)).toEqual({ status: "waiting" })
    expect(await tokenFor(guestP, roomId)).toEqual({ status: "waiting" })
    const waiting = await listWaiting(host, roomId)
    expect(waiting.map((w) => w.userId)).toEqual([guestP.id])
    await decideAdmission(host, roomId, guestP.id, true)
    const g = claimsOf(await tokenFor(guestP, roomId))
    expect(g.video.roomAdmin).toBeFalsy()
  })

  it("people in the waiting room can't admit themselves", async () => {
    const p = await makeUser("l-sneaky")
    await inviteToRoom(host, roomId, [p.email], "participant")
    expect(await tokenFor(p, roomId)).toEqual({ status: "waiting" })
    const r = await attempt(
      p,
      sql`update public.live_room_admissions set status = 'admitted' where room_id = ${roomId} and user_id = ${p.id}`
    )
    expect(r).toMatchObject({ ok: true, count: 0 })
    const ins = await attempt(
      p,
      sql`insert into public.live_room_admissions (room_id, user_id, status) values (${roomId}, ${outsider.id}, 'admitted')`
    )
    expect(ins.ok).toBe(false)
    await expect(decideAdmission(p, roomId, p.id, true)).rejects.toBeInstanceOf(AccessDeniedError)
  })

  it("a removed person can't come back", async () => {
    await removeFromRoom(host, roomId, guestP.id)
    expect(await tokenFor(guestP, roomId)).toEqual({ status: "removed" })
  })

  it("a locked room keeps out new people", async () => {
    const late = await makeUser("l-late")
    await inviteToRoom(host, roomId, [late.email], "participant")
    await setRoomLocked(host, roomId, true)
    expect(await tokenFor(late, roomId)).toEqual({ status: "locked" })
    expect((await tokenFor(cohost, roomId)).status).toBe("admitted")
    await setRoomLocked(host, roomId, false)
    expect(await tokenFor(late, roomId)).toEqual({ status: "waiting" })
  })

  it("only hosts control the room", async () => {
    const p = await makeUser("l-plain")
    await inviteToRoom(host, roomId, [p.email], "participant")
    await expect(setRoomLocked(p, roomId, true)).rejects.toBeInstanceOf(AccessDeniedError)
    await expect(removeFromRoom(p, roomId, cohost.id)).rejects.toBeInstanceOf(AccessDeniedError)
    await expect(listWaiting(p, roomId)).rejects.toBeInstanceOf(AccessDeniedError)
    await expect(endRoom(cohost, roomId)).rejects.toBeInstanceOf(AccessDeniedError)
    await expect(removeFromRoom(cohost, roomId, host.id)).rejects.toBeInstanceOf(AccessDeniedError)
  })
})

describe("room settings", () => {
  it("everyone in the workspace can join an open room, but guests and outsiders can't", async () => {
    const r = await createLiveRoom(host, slug, {
      title: "All hands",
      emails: [],
      waitingRoom: false,
      workspaceVisible: true,
    })
    expect((await tokenFor(colleague, r)).status).toBe("admitted")
    expect(await tokenFor(outsider, r)).toEqual({ status: "no_access" })
    expect(await getLiveRole(guestP, r)).toBeNull()
  })

  it("an ended room is closed to everyone", async () => {
    const r = await createLiveRoom(host, slug, {
      title: "Done",
      emails: [cohost.email],
      waitingRoom: true,
      workspaceVisible: false,
    })
    await endRoom(host, r)
    expect(await tokenFor(host, r)).toEqual({ status: "no_access" })
    expect(await tokenFor(cohost, r)).toEqual({ status: "no_access" })
  })
})
