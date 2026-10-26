"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { emailSchema } from "@/lib/validation"
import { requireUser } from "@/server/auth"
import { setPublicLink } from "@/server/public-links"
import { AccessDeniedError } from "@/server/authz"
import { reactionEmojis } from "@/server/db/schema"
import {
  addComment,
  changeGrantRole,
  deleteComment,
  deleteVideo,
  downloadUrl,
  removeGrant,
  requestAccess,
  resolveAccessRequest,
  setThumbnailAt,
  setPasscode,
  setTrim,
  shareVideo,
  toggleReaction,
  unlockWithPasscode,
  updateShareSettings,
  updateVideoDetails,
} from "@/server/videos"
import { UserFacingError } from "@/server/workspaces"

export type ActionResult = { ok: boolean; message?: string; url?: string }

const id = z.uuid()
const role = z.enum(["viewer", "editor"])

function fail(e: unknown): ActionResult {
  if (e instanceof UserFacingError) return { ok: false, message: e.message }
  if (e instanceof AccessDeniedError)
    return { ok: false, message: "You don't have permission to do that." }
  if (e instanceof z.ZodError)
    return { ok: false, message: e.issues[0]?.message ?? "Check the details and try again." }
  console.error("video action failed", (e as Error)?.name)
  return { ok: false, message: "That didn't work. Try again in a moment." }
}

async function run(videoId: string, fn: () => Promise<ActionResult | void>): Promise<ActionResult> {
  try {
    const res = (await fn()) ?? { ok: true }
    revalidatePath(`/v/${videoId}`)
    return res
  } catch (e) {
    return fail(e)
  }
}

export async function updateDetailsAction(videoId: string, title: string, description: string) {
  return run(videoId, async () => {
    const user = await requireUser()
    const data = z
      .object({
        title: z
          .string()
          .trim()
          .min(1, { error: "Add a title." })
          .max(120, { error: "Use 120 characters or fewer." }),
        description: z.string().trim().max(5000, { error: "Use 5,000 characters or fewer." }),
      })
      .parse({ title, description })
    await updateVideoDetails(user, id.parse(videoId), data)
  })
}

export async function shareAction(videoId: string, raw: string, r: string) {
  return run(videoId, async () => {
    const user = await requireUser()
    const entries = raw.split(/[\s,;]+/).filter(Boolean)
    if (entries.length === 0) return { ok: false, message: "Add at least one email." }
    const bad = entries.filter((e) => !emailSchema.safeParse(e).success)
    if (bad.length)
      return { ok: false, message: `Check ${bad.slice(0, 3).join(", ")}. Use full emails.` }
    const { added } = await shareVideo(
      user,
      id.parse(videoId),
      entries.map((e) => emailSchema.parse(e)),
      role.parse(r)
    )
    return {
      ok: true,
      message: added === 1 ? "Shared with 1 person." : `Shared with ${added} people.`,
    }
  })
}

export async function removeGrantAction(videoId: string, grantId: string) {
  return run(videoId, async () =>
    removeGrant(await requireUser(), id.parse(videoId), id.parse(grantId))
  )
}

export async function changeGrantRoleAction(videoId: string, grantId: string, r: string) {
  return run(videoId, async () =>
    changeGrantRole(await requireUser(), id.parse(videoId), id.parse(grantId), role.parse(r))
  )
}

export async function updateSettingsAction(
  videoId: string,
  s: {
    workspaceVisible: boolean
    accessExpiresAt: string | null
    viewOnly: boolean
    watermark: boolean
  }
) {
  return run(videoId, async () => {
    const user = await requireUser()
    const expires = s.accessExpiresAt ? new Date(`${s.accessExpiresAt}T23:59:59`) : null
    if (expires && Number.isNaN(expires.getTime()))
      return { ok: false, message: "Choose a valid date." }
    if (expires && expires.getTime() < Date.now())
      return { ok: false, message: "Choose a date in the future." }
    await updateShareSettings(user, id.parse(videoId), {
      workspaceVisible: !!s.workspaceVisible,
      accessExpiresAt: expires,
      viewOnly: !!s.viewOnly,
      watermark: !!s.watermark,
    })
  })
}

/** Turn the public link on (a new link each time) or off. Owner only. */
export async function setPublicLinkAction(videoId: string, on: boolean) {
  return run(videoId, async () => {
    const url = await setPublicLink(await requireUser(), id.parse(videoId), on === true)
    return { ok: true, url: url ?? undefined }
  })
}

export async function setPasscodeAction(videoId: string, passcode: string | null) {
  return run(videoId, async () => {
    const user = await requireUser()
    if (passcode !== null) {
      const p = z.string().min(4, { error: "Use at least 4 characters." }).max(64).parse(passcode)
      await setPasscode(user, id.parse(videoId), p)
      return { ok: true, message: "Passcode set. Viewers will need it to watch." }
    }
    await setPasscode(user, id.parse(videoId), null)
    return { ok: true, message: "Passcode removed." }
  })
}

export async function unlockAction(videoId: string, passcode: string) {
  return run(videoId, async () =>
    unlockWithPasscode(await requireUser(), id.parse(videoId), passcode.slice(0, 64))
  )
}

export async function requestAccessAction(videoId: string) {
  return run(videoId, async () =>
    requestAccess(await requireUser(`/v/${videoId}`), id.parse(videoId))
  )
}

export async function resolveRequestAction(videoId: string, requestId: string, approve: boolean) {
  return run(videoId, async () =>
    resolveAccessRequest(await requireUser(), id.parse(videoId), id.parse(requestId), approve)
  )
}

export async function addCommentAction(videoId: string, body: string, atMs: number | null) {
  return run(videoId, async () => {
    const text = z.string().trim().min(1, { error: "Write a comment first." }).max(4000).parse(body)
    const at = atMs === null ? null : z.number().int().nonnegative().parse(Math.round(atMs))
    await addComment(await requireUser(), id.parse(videoId), text, at)
  })
}

export async function deleteCommentAction(videoId: string, commentId: string) {
  return run(videoId, async () =>
    deleteComment(await requireUser(), id.parse(videoId), id.parse(commentId))
  )
}

export async function toggleReactionAction(videoId: string, emoji: string, atMs: number | null) {
  return run(videoId, async () =>
    toggleReaction(
      await requireUser(),
      id.parse(videoId),
      z.enum(reactionEmojis).parse(emoji),
      atMs === null ? null : Math.max(0, Math.round(atMs))
    )
  )
}

export async function setTrimAction(videoId: string, startMs: number | null, endMs: number | null) {
  return run(videoId, async () => {
    if (startMs !== null && endMs !== null && endMs <= startMs) {
      return { ok: false, message: "The end has to be after the start." }
    }
    await setTrim(await requireUser(), id.parse(videoId), startMs, endMs)
    return { ok: true, message: "Trimming. The new version will be ready in a moment." }
  })
}

export async function thumbnailAtAction(videoId: string, atMs: number) {
  return run(videoId, async () => {
    await setThumbnailAt(
      await requireUser(),
      id.parse(videoId),
      z.number().nonnegative().parse(atMs)
    )
    return { ok: true, message: "New thumbnail coming up. It shows in a moment." }
  })
}

export async function downloadAction(videoId: string): Promise<ActionResult> {
  try {
    return { ok: true, url: await downloadUrl(await requireUser(), id.parse(videoId)) }
  } catch (e) {
    return fail(e)
  }
}

export async function deleteVideoAction(videoId: string, slug: string) {
  try {
    await deleteVideo(await requireUser(), id.parse(videoId))
  } catch (e) {
    return fail(e)
  }
  redirect(`/w/${slug}/library`)
}

/** Form-friendly wrapper for the access-denied screen. The page re-renders as "Request sent". */
export async function requestAccessFormAction(videoId: string): Promise<void> {
  await requestAccessAction(videoId)
}
