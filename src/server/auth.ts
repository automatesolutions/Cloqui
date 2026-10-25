import "server-only"
import { cache } from "react"
import { redirect } from "next/navigation"
import { eq } from "drizzle-orm"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { withRls, type RlsClaims } from "@/server/db"
import { profiles } from "@/server/db/schema"

export type CurrentUser = {
  id: string
  email: string
  displayName: string
  claims: RlsClaims
  /** aal2 = signed in with a second step (TOTP) in this session. */
  aal: "aal1" | "aal2"
  hasTwoFactor: boolean
}

type SessionState = { user: CurrentUser | null; pendingTwoFactor: boolean }

/**
 * Reads and verifies the session once per request.
 * Someone who has 2FA set up but hasn't entered the code yet is NOT signed in for any data path:
 * they only get as far as the code screen.
 */
const readSession = cache(async (): Promise<SessionState> => {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.getClaims()
  const sub = data?.claims?.sub
  const email = data?.claims?.email
  if (error || !sub || typeof email !== "string") return { user: null, pendingTwoFactor: false }

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  const hasTwoFactor = aal?.nextLevel === "aal2"
  if (hasTwoFactor && aal?.currentLevel !== "aal2") return { user: null, pendingTwoFactor: true }

  const currentAal = aal?.currentLevel === "aal2" ? "aal2" : "aal1"
  // RLS reads aal from these claims: workspaces that require two-step sign-in check it.
  const claims: RlsClaims = { sub, email, aal: currentAal }
  const [profile] = await withRls(claims, (tx) =>
    tx.select({ displayName: profiles.displayName }).from(profiles).where(eq(profiles.id, sub))
  )
  return {
    pendingTwoFactor: false,
    user: {
      id: sub,
      email,
      displayName: profile?.displayName ?? email.split("@")[0],
      claims,
      aal: currentAal,
      hasTwoFactor,
    },
  }
})

/** The signed-in person, or null. Reads cookies, so call it inside a <Suspense> boundary. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  return (await readSession()).user
}

/** Like getCurrentUser, but sends signed-out people to sign in (or to the 2FA code) and back. */
export async function requireUser(next?: string): Promise<CurrentUser> {
  const { user, pendingTwoFactor } = await readSession()
  const back = next ? `?next=${encodeURIComponent(next)}` : ""
  if (pendingTwoFactor) redirect(`/sign-in/2fa${back}`)
  if (!user) redirect(`/sign-in${back}`)
  return user
}

/** True when the password step is done but the 2FA code is still needed. */
export async function isTwoFactorPending() {
  return (await readSession()).pendingTwoFactor
}
