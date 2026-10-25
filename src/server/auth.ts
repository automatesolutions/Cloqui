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
}

/**
 * The signed-in person, from verified JWT claims (getClaims checks the signature).
 * Deduplicated per request. Reads cookies, so call it inside a <Suspense> boundary.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.getClaims()
  const sub = data?.claims?.sub
  const email = data?.claims?.email
  if (error || !sub || typeof email !== "string") return null

  const claims: RlsClaims = { sub, email }
  const [profile] = await withRls(claims, (tx) =>
    tx.select({ displayName: profiles.displayName }).from(profiles).where(eq(profiles.id, sub))
  )
  return {
    id: sub,
    email,
    displayName: profile?.displayName ?? email.split("@")[0],
    claims,
  }
})

/** Like getCurrentUser, but sends signed-out people to sign in and back. */
export async function requireUser(next?: string): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user) redirect(next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in")
  return user
}
