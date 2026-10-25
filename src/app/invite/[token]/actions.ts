"use server"

import { redirect } from "next/navigation"
import type { FormState } from "@/lib/validation"
import { requireUser } from "@/server/auth"
import { acceptInvite, getInvitePreview, UserFacingError } from "@/server/workspaces"

export async function acceptInviteAction(token: string): Promise<FormState> {
  const user = await requireUser(`/invite/${token}`)
  const preview = await getInvitePreview(token)
  if (!preview) return { message: "This invite isn't valid anymore." }
  try {
    await acceptInvite(user, token)
  } catch (e) {
    if (e instanceof UserFacingError) return { message: e.message }
    return { message: "We couldn't accept the invite. Try again in a moment." }
  }
  redirect(preview.role === "guest" ? "/home" : `/w/${preview.workspaceSlug}`)
}
