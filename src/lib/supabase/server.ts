import "server-only"
import { cookies } from "next/headers"
import { connection } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { env } from "@/lib/env"

/** Supabase client bound to the request's auth cookies. Server Components, actions, routes. */
export async function createSupabaseServerClient() {
  // Auth reads the clock (token expiry). Mark this as request-time work so Next never tries to
  // prerender it into a shared or per-session shell. Session data is never pre-built.
  await connection()
  const cookieStore = await cookies()
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Called from a Server Component, where cookies are read-only. The proxy refreshes them.
        }
      },
    },
  })
}
