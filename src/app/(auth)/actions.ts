"use server"

import { redirect } from "next/navigation"
import { z } from "zod"
import { env } from "@/lib/env"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import {
  displayNameSchema,
  emailSchema,
  fieldErrorsOf,
  passwordSchema,
  safeNext,
  type FormState,
} from "@/lib/validation"
import { isBreachedPassword } from "@/server/password"

const confirmUrl = (next: string) =>
  `${env.NEXT_PUBLIC_APP_URL}/auth/confirm?next=${encodeURIComponent(next)}`

export async function signUpAction(_: FormState, formData: FormData): Promise<FormState> {
  const values = {
    displayName: String(formData.get("displayName") ?? ""),
    email: String(formData.get("email") ?? ""),
  }
  const parsed = z
    .object({ displayName: displayNameSchema, email: emailSchema, password: passwordSchema })
    .safeParse({ ...values, password: formData.get("password") })
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error), values }

  if (await isBreachedPassword(parsed.data.password)) {
    return {
      fieldErrors: {
        password: "This password has appeared in a data breach. Choose a different one.",
      },
      values,
    }
  }

  const next = safeNext(formData.get("next"))
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.displayName },
      emailRedirectTo: confirmUrl(next),
    },
  })
  if (error) {
    if (error.code === "weak_password") {
      return { fieldErrors: { password: "Choose a stronger password." }, values }
    }
    if (error.code === "over_email_send_rate_limit" || error.status === 429) {
      return { message: "Too many tries. Wait a minute and try again.", values }
    }
    return { message: "We couldn't create your account. Try again in a moment.", values }
  }
  redirect("/check-email?reason=confirm")
}

export async function signInAction(_: FormState, formData: FormData): Promise<FormState> {
  const values = { email: String(formData.get("email") ?? "") }
  const parsed = z
    .object({ email: emailSchema, password: z.string().min(1, { error: "Add your password." }) })
    .safeParse({ ...values, password: formData.get("password") })
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error), values }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)
  if (error) {
    if (error.code === "email_not_confirmed") {
      return { message: "Confirm your email first. Check your inbox for the link.", values }
    }
    if (error.status === 429)
      return { message: "Too many tries. Wait a minute and try again.", values }
    return { message: "That email and password don't match.", values }
  }
  redirect(safeNext(formData.get("next")))
}

export async function magicLinkAction(_: FormState, formData: FormData): Promise<FormState> {
  const values = { email: String(formData.get("email") ?? "") }
  const parsed = emailSchema.safeParse(values.email)
  if (!parsed.success) return { fieldErrors: { email: parsed.error.issues[0]?.message }, values }

  const supabase = await createSupabaseServerClient()
  // Same answer whether or not the account exists, so nobody can probe for emails.
  await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: confirmUrl(safeNext(formData.get("next"))),
    },
  })
  redirect("/check-email?reason=magic")
}

export async function forgotPasswordAction(_: FormState, formData: FormData): Promise<FormState> {
  const values = { email: String(formData.get("email") ?? "") }
  const parsed = emailSchema.safeParse(values.email)
  if (!parsed.success) return { fieldErrors: { email: parsed.error.issues[0]?.message }, values }

  const supabase = await createSupabaseServerClient()
  await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: confirmUrl("/reset-password"),
  })
  redirect("/check-email?reason=reset")
}

export async function resetPasswordAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = passwordSchema.safeParse(formData.get("password"))
  if (!parsed.success) return { fieldErrors: { password: parsed.error.issues[0]?.message } }
  if (await isBreachedPassword(parsed.data)) {
    return {
      fieldErrors: {
        password: "This password has appeared in a data breach. Choose a different one.",
      },
    }
  }
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.updateUser({ password: parsed.data })
  if (error) {
    if (error.code === "same_password") {
      return { fieldErrors: { password: "Choose a password you haven't used here before." } }
    }
    return { message: "That link has expired. Ask for a new one from the sign-in page." }
  }
  redirect("/home")
}

export async function oauthAction(formData: FormData) {
  const provider = formData.get("provider") === "azure" ? "azure" : "google"
  const next = safeNext(formData.get("next"))
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${env.NEXT_PUBLIC_APP_URL}/auth/callback?next=${encodeURIComponent(next)}`,
      scopes: provider === "azure" ? "email" : undefined,
    },
  })
  if (error || !data.url) redirect("/sign-in?error=oauth")
  redirect(data.url)
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  redirect("/")
}

/** Ends every session on every device, including this one. */
export async function signOutEverywhereAction() {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut({ scope: "global" })
  redirect("/sign-in?signedOut=everywhere")
}
