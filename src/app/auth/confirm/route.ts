import { NextResponse, type NextRequest } from "next/server"
import type { EmailOtpType } from "@supabase/supabase-js"
import { appURL } from "@/lib/app-url"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { safeNext } from "@/lib/validation"

const allowedTypes = new Set<EmailOtpType>([
  "email",
  "signup",
  "magiclink",
  "recovery",
  "email_change",
  "invite",
])

// Email links (confirm, magic link, recovery) land here with a one-time token hash.
export async function GET(request: NextRequest) {
  const url = request.nextUrl
  const tokenHash = url.searchParams.get("token_hash")
  const type = url.searchParams.get("type") as EmailOtpType | null
  const code = url.searchParams.get("code")
  const next = safeNext(url.searchParams.get("next"))
  const supabase = await createSupabaseServerClient()

  // Same browser: Supabase sends a one-time code. Any device: the email carries a token hash.
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(appURL(next))
  }
  if (tokenHash && type && allowedTypes.has(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (!error) return NextResponse.redirect(appURL(next))
  }
  return NextResponse.redirect(appURL("/sign-in?error=link"))
}
