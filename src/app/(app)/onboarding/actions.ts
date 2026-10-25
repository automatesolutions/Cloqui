"use server"

import { redirect } from "next/navigation"
import { z } from "zod"
import { fieldErrorsOf, slugSchema, workspaceNameSchema, type FormState } from "@/lib/validation"
import { requireUser } from "@/server/auth"
import { createWorkspace, UserFacingError } from "@/server/workspaces"

export async function createWorkspaceAction(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser()
  const values = {
    name: String(formData.get("name") ?? ""),
    slug: String(formData.get("slug") ?? ""),
  }
  const parsed = z.object({ name: workspaceNameSchema, slug: slugSchema }).safeParse(values)
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error), values }
  try {
    await createWorkspace(user, parsed.data.name, parsed.data.slug)
  } catch (e) {
    if (e instanceof UserFacingError) return { fieldErrors: { slug: e.message }, values }
    return { message: "We couldn't create the workspace. Try again in a moment.", values }
  }
  redirect(`/onboarding/invite?w=${encodeURIComponent(parsed.data.slug)}`)
}
