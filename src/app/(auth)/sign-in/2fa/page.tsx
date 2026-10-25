import type { Metadata } from "next"
import { Suspense } from "react"
import { safeNext } from "@/lib/validation"
import { AuthHeading, AuthFormSkeleton } from "../../auth-shell"
import { CodeForm } from "./code-form"

export const metadata: Metadata = { title: "Two-step sign-in" }

export default function TwoFactorPage({ searchParams }: PageProps<"/sign-in/2fa">) {
  return (
    <>
      <AuthHeading title="Enter your code" body="Open your authenticator app and type the 6-digit code for Cloqui." />
      <Suspense fallback={<AuthFormSkeleton />}>
        <Body searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function Body({ searchParams }: { searchParams: PageProps<"/sign-in/2fa">["searchParams"] }) {
  const sp = await searchParams
  return <CodeForm next={safeNext(sp.next)} />
}
