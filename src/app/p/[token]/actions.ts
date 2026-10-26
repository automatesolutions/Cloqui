"use server"

import { AccessDeniedError } from "@/server/authz"
import { getPublicView, isPublicToken, unlockPublic, type PublicView } from "@/server/public-links"
import { UserFacingError } from "@/server/workspaces"

type Unlocked = Extract<PublicView, { kind: "ok" }>

/** Check the passcode on a public link. On success, returns the video and this tab's unlock. */
export async function unlockPublicAction(
  token: string,
  passcode: string
): Promise<{ ok: true; unlock: string; view: Unlocked } | { ok: false; message: string }> {
  if (!isPublicToken(token)) return { ok: false, message: "This link doesn't work anymore." }
  try {
    const unlock = await unlockPublic(token, passcode.slice(0, 64))
    const view = await getPublicView(token, unlock)
    if (view.kind !== "ok") return { ok: false, message: "This link doesn't work anymore." }
    return { ok: true, unlock, view }
  } catch (e) {
    if (e instanceof UserFacingError) return { ok: false, message: e.message }
    if (e instanceof AccessDeniedError)
      return { ok: false, message: "This link doesn't work anymore." }
    console.error("public unlock failed", (e as Error)?.name)
    return { ok: false, message: "That didn't work. Try again in a moment." }
  }
}
