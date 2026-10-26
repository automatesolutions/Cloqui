import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { safeNext } from "@/lib/validation"
import { AuthFormSkeleton, AuthHeading, PrivateNote } from "../auth-shell"
import { OAuthButtons } from "../oauth-buttons"
import { SignUpForm } from "./sign-up-form"

export const metadata: Metadata = { title: "Create an account" }

export default function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  return (
    <>
      <AuthHeading
        title="Create your account"
        body="Start free. Your work stays private until you share it."
      />
      <Suspense fallback={<AuthFormSkeleton />}>
        <SignUpBody searchParams={searchParams} />
      </Suspense>
      <PrivateNote />
    </>
  )
}

async function SignUpBody({
  searchParams,
}: {
  searchParams: PageProps<"/sign-up">["searchParams"]
}) {
  const sp = await searchParams
  const next = safeNext(sp.next)
  const email = typeof sp.email === "string" ? sp.email : undefined
  return (
    <>
      <OAuthButtons next={next} />
      <SignUpForm next={next} email={email} />
      <p className="mt-6 text-callout text-fg-secondary">
        Already have an account?{" "}
        <Link
          href={`/sign-in${next !== "/home" ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="font-medium text-brand underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </>
  )
}
