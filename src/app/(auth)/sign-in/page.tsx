import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { safeNext } from "@/lib/validation"
import { AuthFormSkeleton, AuthHeading, PrivateNote } from "../auth-shell"
import { OAuthButtons } from "../oauth-buttons"
import { SignInForm } from "./sign-in-form"

export const metadata: Metadata = { title: "Sign in" }

const notices: Record<string, string> = {
  link: "That link has expired or was already used. Sign in, or ask for a new link.",
  oauth: "We couldn't finish signing you in. Try again.",
}

export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <>
      <AuthHeading title="Sign in" body="Welcome back. Your workspace is where you left it." />
      <Suspense fallback={<AuthFormSkeleton />}>
        <SignInBody searchParams={searchParams} />
      </Suspense>
      <PrivateNote />
    </>
  )
}

async function SignInBody({
  searchParams,
}: {
  searchParams: PageProps<"/sign-in">["searchParams"]
}) {
  const sp = await searchParams
  const next = safeNext(sp.next)
  const error = typeof sp.error === "string" ? notices[sp.error] : undefined
  const signedOut = sp.signedOut === "everywhere" ? "You're signed out on every device." : undefined
  return (
    <>
      <OAuthButtons next={next} />
      <SignInForm next={next} notice={error ?? signedOut} />
      <p className="mt-6 text-callout text-fg-secondary">
        New to Cloqui?{" "}
        <Link
          href={`/sign-up${next !== "/home" ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="font-medium text-brand underline-offset-4 hover:underline"
        >
          Create an account
        </Link>
      </p>
    </>
  )
}
