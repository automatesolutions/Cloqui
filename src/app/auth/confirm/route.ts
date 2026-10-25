import { NextResponse, type NextRequest } from "next/server"
import type { EmailOtpType } from "@supabase/supabase-js"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { safeNext } from "@/lib/validation"

const allowedTypes = new Set<EmailOtpType>(["email", "recovery", "email_change", "invite"])

// Email links (confirm, magic link, recovery) land here with a one-time token hash.
export async function GET(request: NextRequest) {
  const url = request.nextUrl
  const tokenHash = url.searchParams.get("token_hash")
  const type = url.searchParams.get("type") as EmailOtpType | null
  const next = safeNext(url.searchParams.get("next"))

  if (tokenHash && type && allowedTypes.has(type)) {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (!error) return NextResponse.redirect(new URL(next, url.origin))
  }
  return NextResponse.redirect(new URL("/sign-in?error=link", url.origin))
}
