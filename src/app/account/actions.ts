"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { displayNameSchema, safeNext, type FormState } from "@/lib/validation"
import { deleteMyAccount } from "@/server/account"
import { isTwoFactorPending, requireUser } from "@/server/auth"
import { withRls } from "@/server/db"
import { takeToken } from "@/server/rate-limit"
import { profiles } from "@/server/db/schema"
import { UserFacingError } from "@/server/workspaces"

type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string }
// Authenticator codes are only 6 digits: limit tries per account, not just per IP.
const tooManyTries = {
  ok: false as const,
  message: "Too many tries. Wait a few minutes and try again.",
}
const code = z
  .string()
  .trim()
  .regex(/^\d{6}$/, { error: "Enter the 6-digit code from your app." })

/** Start setting up an authenticator app. Returns a QR code (SVG data URL) and the key. */
export async function startTwoFactorAction(): Promise<
  Result<{ factorId: string; qr: string; secret: string }>
> {
  await requireUser("/account")
  const supabase = await createSupabaseServerClient()
  // Remove half-finished setups first so there's only ever one pending factor.
  const { data: list } = await supabase.auth.mfa.listFactors()
  for (const f of list?.all ?? []) {
    if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id })
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}`,
  })
  if (error || !data)
    return { ok: false, message: "We couldn't start setup. Try again in a moment." }
  return { ok: true, factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret }
}

export async function confirmTwoFactorAction(factorId: string, input: string): Promise<Result> {
  const user = await requireUser("/account")
  if (!(await takeToken("twoFactor", user.id))) return tooManyTries
  const parsed = code.safeParse(input)
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message }
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: parsed.data })
  if (error)
    return {
      ok: false,
      message: "That code didn't work. Check the time on your phone and try the newest code.",
    }
  revalidatePath("/account")
  return { ok: true }
}

/** Turning it off needs a current code, so a stolen session alone can't remove it. */
export async function disableTwoFactorAction(input: string): Promise<Result> {
  const user = await requireUser("/account")
  if (!(await takeToken("twoFactor", user.id))) return tooManyTries
  const parsed = code.safeParse(input)
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message }
  const supabase = await createSupabaseServerClient()
  const { data: list } = await supabase.auth.mfa.listFactors()
  const factor = list?.totp?.[0]
  if (!factor) return { ok: true }
  const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
    factorId: factor.id,
    code: parsed.data,
  })
  if (verifyError)
    return { ok: false, message: "That code didn't work. Try the newest code from your app." }
  const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id })
  if (error) return { ok: false, message: "We couldn't turn it off. Try again in a moment." }
  revalidatePath("/account")
  return { ok: true }
}

/** The second step of signing in. */
export async function verifySignInCodeAction(input: string, next: string): Promise<Result> {
  if (!(await isTwoFactorPending())) redirect(safeNext(next))
  const parsed = code.safeParse(input)
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message }
  const supabase = await createSupabaseServerClient()
  // Half signed in: the verified claims still say who it is.
  const { data: claims } = await supabase.auth.getClaims()
  const sub = claims?.claims?.sub
  if (!sub || !(await takeToken("twoFactor", sub))) return tooManyTries
  const { data: list } = await supabase.auth.mfa.listFactors()
  const factor = list?.totp?.find((f) => f.status === "verified")
  if (!factor) redirect(safeNext(next))
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: factor.id,
    code: parsed.data,
  })
  if (error)
    return { ok: false, message: "That code didn't work. Try the newest code from your app." }
  redirect(safeNext(next))
}

export async function deleteAccountAction(confirmEmail: string): Promise<Result> {
  const user = await requireUser("/account")
  try {
    await deleteMyAccount(user, confirmEmail)
  } catch (e) {
    if (e instanceof UserFacingError) return { ok: false, message: e.message }
    console.error("account deletion failed", (e as Error)?.name)
    return { ok: false, message: "We couldn't delete your account. Try again in a moment." }
  }
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  redirect("/?deleted=1")
}

/** Your name, as everyone in your workspaces sees it. */
export async function updateNameAction(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("/account")
  const parsed = displayNameSchema.safeParse(formData.get("displayName"))
  if (!parsed.success) return { fieldErrors: { displayName: parsed.error.issues[0]?.message } }
  await withRls(user.claims, (tx) =>
    tx.update(profiles).set({ displayName: parsed.data }).where(eq(profiles.id, user.id))
  )
  revalidatePath("/", "layout")
  return { ok: true, message: "Saved." }
}
