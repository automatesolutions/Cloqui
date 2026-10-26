"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import {
  domainSchema,
  emailSchema,
  fieldErrorsOf,
  workspaceNameSchema,
  type FormState,
} from "@/lib/validation"
import { requireUser } from "@/server/auth"
import { AccessDeniedError } from "@/server/authz"
import { setAllowPublicLinks } from "@/server/public-links"
import { deleteWorkspace, setRequireTwoFactor, setRetention } from "@/server/workspace-admin"
import {
  changeMemberRole,
  inviteMembers,
  removeMember,
  revokeInvite,
  updateWorkspace,
  UserFacingError,
} from "@/server/workspaces"

const roleSchema = z.enum(["admin", "member", "guest"])

function failure(e: unknown): FormState {
  if (e instanceof AccessDeniedError) return { message: "You don't have permission to do that." }
  if (e instanceof UserFacingError) return { message: e.message }
  console.error("settings action failed", (e as Error)?.name)
  return { message: "That didn't work. Try again in a moment." }
}

export async function updateWorkspaceAction(
  slug: string,
  _: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await requireUser()
  const rawDomain = String(formData.get("allowedEmailDomain") ?? "").trim()
  const parsed = z
    .object({ name: workspaceNameSchema, allowedEmailDomain: domainSchema.nullable() })
    .safeParse({
      name: formData.get("name"),
      allowedEmailDomain: rawDomain === "" ? null : rawDomain,
    })
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) }
  try {
    await updateWorkspace(user, slug, parsed.data)
  } catch (e) {
    return failure(e)
  }
  revalidatePath(`/w/${slug}`, "layout")
  return { ok: true, message: "Saved." }
}

export async function inviteAction(
  slug: string,
  _: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await requireUser()
  const raw = String(formData.get("emails") ?? "")
  const entries = raw.split(/[\s,;]+/).filter(Boolean)
  if (entries.length === 0)
    return { fieldErrors: { emails: "Add at least one email." }, values: { emails: raw } }
  const bad = entries.filter((e) => !emailSchema.safeParse(e).success)
  if (bad.length) {
    return {
      fieldErrors: {
        emails: `Check ${bad.slice(0, 3).join(", ")}. Use full emails, like maria@acme.co`,
      },
      values: { emails: raw },
    }
  }
  const role = roleSchema.safeParse(formData.get("role"))
  if (!role.success) return { fieldErrors: { role: "Choose a role." }, values: { emails: raw } }

  try {
    const res = await inviteMembers(
      user,
      slug,
      entries.map((e) => emailSchema.parse(e)),
      role.data
    )
    revalidatePath(`/w/${slug}/settings/members`)
    const sent = res.sent.length
    const parts = [sent ? `Invited ${sent} ${sent === 1 ? "person" : "people"}.` : ""]
    for (const s of res.skipped) parts.push(`${s.email}: ${s.reason}`)
    return { ok: sent > 0, message: parts.filter(Boolean).join(" ") }
  } catch (e) {
    return { ...failure(e), values: { emails: raw } }
  }
}

export async function revokeInviteAction(slug: string, inviteId: string): Promise<FormState> {
  const user = await requireUser()
  try {
    await revokeInvite(user, slug, z.uuid().parse(inviteId))
  } catch (e) {
    return failure(e)
  }
  revalidatePath(`/w/${slug}/settings/members`)
  return { ok: true }
}

export async function changeRoleAction(
  slug: string,
  userId: string,
  role: string
): Promise<FormState> {
  const user = await requireUser()
  try {
    await changeMemberRole(user, slug, z.uuid().parse(userId), roleSchema.parse(role))
  } catch (e) {
    return failure(e)
  }
  revalidatePath(`/w/${slug}/settings/members`)
  return { ok: true }
}

export async function removeMemberAction(slug: string, userId: string): Promise<FormState> {
  const user = await requireUser()
  try {
    await removeMember(user, slug, z.uuid().parse(userId))
  } catch (e) {
    return failure(e)
  }
  revalidatePath(`/w/${slug}/settings/members`)
  return { ok: true }
}

export async function setRequireTwoFactorAction(slug: string, on: boolean): Promise<FormState> {
  const user = await requireUser()
  try {
    await setRequireTwoFactor(user, slug, on)
  } catch (e) {
    return failure(e)
  }
  revalidatePath(`/w/${slug}/settings/security`)
  return { ok: true }
}

export async function setAllowPublicLinksAction(
  slug: string,
  allow: boolean
): Promise<FormState & { removed?: number }> {
  const user = await requireUser()
  let removed: number
  try {
    removed = await setAllowPublicLinks(user, slug, allow === true)
  } catch (e) {
    return failure(e)
  }
  revalidatePath(`/w/${slug}/settings/security`)
  return { ok: true, removed }
}

// Empty means "keep forever". Otherwise a whole number of days, 7 to 3650.
const retentionDays = z.preprocess(
  (v) => (v === "" || v === "forever" || v == null ? null : Number(v)),
  z
    .number()
    .int()
    .min(7, { error: "Keep things at least 7 days." })
    .max(3650, { error: "10 years is the most." })
    .nullable()
)

export async function setRetentionAction(
  slug: string,
  _: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await requireUser()
  const parsed = z
    .object({ retentionVideoDays: retentionDays, retentionMessageDays: retentionDays })
    .safeParse({
      retentionVideoDays: formData.get("retentionVideoDays"),
      retentionMessageDays: formData.get("retentionMessageDays"),
    })
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) }
  try {
    await setRetention(user, slug, parsed.data)
  } catch (e) {
    return failure(e)
  }
  revalidatePath(`/w/${slug}/settings/security`)
  return { ok: true, message: "Saved." }
}

export async function deleteWorkspaceAction(slug: string, typedName: string): Promise<FormState> {
  const user = await requireUser()
  try {
    await deleteWorkspace(user, slug, typedName)
  } catch (e) {
    return failure(e)
  }
  redirect("/home")
}
