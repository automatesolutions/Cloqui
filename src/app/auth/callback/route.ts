import { NextResponse, type NextRequest } from "next/server"
import { appURL } from "@/lib/app-url"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { safeNext } from "@/lib/validation"

// OAuth (Google, Microsoft) returns here with a one-time code.
export async function GET(request: NextRequest) {
  const url = request.nextUrl
  const code = url.searchParams.get("code")
  const next = safeNext(url.searchParams.get("next"))

  if (code) {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(appURL(next))
  }
  return NextResponse.redirect(appURL("/sign-in?error=oauth"))
}
