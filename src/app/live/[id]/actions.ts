"use server"

import { redirect } from "next/navigation"
import { z } from "zod"
import { emailSchema } from "@/lib/validation"
import { requireUser } from "@/server/auth"
import { AccessDeniedError } from "@/server/authz"
import {
  createLiveRoom,
  decideAdmission,
  endRoom,
  heartbeat,
  inviteToRoom,
  listWaiting,
  muteEveryone,
  removeFromRoom,
  setRoomLocked,
  tokenFor,
  type JoinResult,
} from "@/server/live"
import { UserFacingError } from "@/server/workspaces"

type Result = { ok: boolean; message?: string }
const id = z.uuid()

function fail(e: unknown): Result {
  if (e instanceof UserFacingError) return { ok: false, message: e.message }
  if (e instanceof AccessDeniedError) return { ok: false, message: "Only the host can do that." }
  if (e instanceof z.ZodError)
    return { ok: false, message: e.issues[0]?.message ?? "Check the details and try again." }
  console.error("live action failed", (e as Error)?.name)
  return { ok: false, message: "That didn't work. Try again in a moment." }
}

function parseEmails(raw: string) {
  const entries = raw.split(/[\s,;]+/).filter(Boolean)
  const bad = entries.filter((e) => !emailSchema.safeParse(e).success)
  if (bad.length) throw new UserFacingError(`Check ${bad.slice(0, 3).join(", ")}. Use full emails.`)
  return entries.map((e) => emailSchema.parse(e))
}

export async function createRoomAction(
  slug: string,
  input: { title: string; emails: string; waitingRoom: boolean; workspaceVisible: boolean }
): Promise<Result> {
  let roomId: string
  try {
    const user = await requireUser()
    const title = z
      .string()
      .trim()
      .min(1, { error: "Add a name for the room." })
      .max(120)
      .parse(input.title)
    roomId = await createLiveRoom(user, slug, {
      title,
      emails: parseEmails(input.emails),
      waitingRoom: !!input.waitingRoom,
      workspaceVisible: !!input.workspaceVisible,
    })
  } catch (e) {
    return fail(e)
  }
  redirect(`/live/${roomId}`)
}

export async function joinAction(roomId: string): Promise<JoinResult> {
  const user = await requireUser(`/live/${roomId}`)
  return tokenFor(user, id.parse(roomId))
}

export async function heartbeatAction(roomId: string) {
  const user = await requireUser()
  await heartbeat(user, id.parse(roomId))
}

export async function waitingAction(roomId: string) {
  const user = await requireUser()
  try {
    return await listWaiting(user, id.parse(roomId))
  } catch {
    return []
  }
}

export async function decideAction(
  roomId: string,
  userId: string,
  admit: boolean
): Promise<Result> {
  try {
    await decideAdmission(await requireUser(), id.parse(roomId), id.parse(userId), admit)
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function removeAction(roomId: string, userId: string): Promise<Result> {
  try {
    await removeFromRoom(await requireUser(), id.parse(roomId), id.parse(userId))
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function lockAction(roomId: string, locked: boolean): Promise<Result> {
  try {
    await setRoomLocked(await requireUser(), id.parse(roomId), locked)
    return { ok: true, message: locked ? "Room locked. Nobody new can join." : "Room unlocked." }
  } catch (e) {
    return fail(e)
  }
}

export async function muteAllAction(roomId: string): Promise<Result> {
  try {
    const n = await muteEveryone(await requireUser(), id.parse(roomId))
    return {
      ok: true,
      message: n === 0 ? "Everyone was already muted." : "Everyone else is muted.",
    }
  } catch (e) {
    return fail(e)
  }
}

export async function inviteAction(roomId: string, raw: string): Promise<Result> {
  try {
    const n = await inviteToRoom(
      await requireUser(),
      id.parse(roomId),
      parseEmails(raw),
      "participant"
    )
    return { ok: true, message: n === 1 ? "Invited 1 person." : `Invited ${n} people.` }
  } catch (e) {
    return fail(e)
  }
}

export async function endAction(roomId: string): Promise<Result> {
  try {
    await endRoom(await requireUser(), id.parse(roomId))
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}
