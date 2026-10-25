import type { Metadata } from "next"
import { Suspense } from "react"
import Link from "next/link"
import { Lock } from "lucide-react"
import { signOutAction } from "@/app/(auth)/actions"
import { Logo } from "@/components/brand/logo"
import { ClosedDoorArt } from "@/components/privacy/access-denied"
import { Button } from "@/components/ui/button"
import { getCurrentUser } from "@/server/auth"
import { getWorkspaceAccess } from "@/server/authz"
import { getInvitePreview } from "@/server/workspaces"
import { acceptInviteAction } from "./actions"
import { AcceptButton } from "./accept-button"

export const metadata: Metadata = { title: "Invite", referrer: "no-referrer" }

function mask(email: string) {
  const [local, domain] = email.split("@")
  return `${local.slice(0, 1)}•••@${domain}`
}

export default function InvitePage({ params }: PageProps<"/invite/[token]">) {
  return (
    <div className="flex min-h-dvh flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <header className="container-page flex h-14 items-center">
        <Link
          href="/"
          aria-label="Cloqui home"
          className="-ml-1 inline-flex h-11 items-center rounded-md px-1"
        >
          <Logo />
        </Link>
      </header>
      <main id="main" className="container-page flex flex-1 items-center justify-center pb-16">
        <div className="w-full max-w-[420px] text-center">
          <Suspense fallback={<div aria-busy className="mx-auto h-64 rounded-lg bg-raised" />}>
            <InviteBody params={params} />
          </Suspense>
        </div>
      </main>
    </div>
  )
}

async function InviteBody({ params }: { params: PageProps<"/invite/[token]">["params"] }) {
  const { token } = await params
  const [preview, user] = await Promise.all([getInvitePreview(token), getCurrentUser()])
  const next = `/invite/${token}`

  if (!preview || preview.status === "revoked" || preview.status === "expired") {
    return (
      <>
        <ClosedDoorArt className="mx-auto mb-5 h-24 w-30" />
        <h1 className="text-title-2 font-bold">This invite isn&apos;t valid anymore</h1>
        <p className="mt-3 text-callout text-fg-secondary">
          {preview?.status === "expired" ? "It expired. " : "It was canceled or replaced. "}
          Ask {preview?.inviterName ?? "the person who invited you"} for a new one.
        </p>
        <Button variant="ghost" asChild className="mt-6">
          <Link href={user ? "/home" : "/"}>{user ? "Go to Home" : "Go to Cloqui"}</Link>
        </Button>
      </>
    )
  }

  if (preview.status === "accepted") {
    const access = user ? await getWorkspaceAccess(user, preview.workspaceSlug) : null
    return (
      <>
        <h1 className="text-title-2 font-bold">This invite was already used</h1>
        <p className="mt-3 text-callout text-fg-secondary">Each invite link works once.</p>
        <Button asChild className="mt-6">
          <Link href={access ? `/w/${preview.workspaceSlug}` : user ? "/home" : "/sign-in"}>
            {access ? `Open ${preview.workspaceName}` : user ? "Go to Home" : "Sign in"}
          </Link>
        </Button>
      </>
    )
  }

  const heading = (
    <>
      <span className="mx-auto mb-6 grid size-14 place-items-center rounded-lg bg-brand-soft text-brand-ink">
        <Lock aria-hidden className="size-7" strokeWidth={1.75} />
      </span>
      <h1 className="text-title-2 font-bold">
        {preview.inviterName ?? "Someone"} invited you to {preview.workspaceName}
      </h1>
      <p className="mt-3 text-callout text-fg-secondary">
        {preview.role === "guest"
          ? "You'll only see the items they share with you."
          : "It's a private workspace. Only invited people can join."}
      </p>
    </>
  )

  if (!user) {
    return (
      <>
        {heading}
        <p className="mt-6 text-footnote text-fg-muted">
          This invite was sent to {mask(preview.email)}.
        </p>
        <div className="mt-4 grid gap-2">
          <Button asChild>
            <Link
              href={`/sign-up?next=${encodeURIComponent(next)}&email=${encodeURIComponent(preview.email)}`}
            >
              Create an account
            </Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link href={`/sign-in?next=${encodeURIComponent(next)}`}>
              I already have an account
            </Link>
          </Button>
        </div>
      </>
    )
  }

  if (user.email.toLowerCase() !== preview.email.toLowerCase()) {
    return (
      <>
        {heading}
        <p
          className="mt-6 rounded-md bg-attention-soft px-4 py-3 text-callout text-attention"
          role="status"
        >
          This invite is for {mask(preview.email)}. You&apos;re signed in as {user.email}.
        </p>
        <form action={signOutAction} className="mt-4">
          <Button type="submit" variant="secondary" className="w-full">
            Sign out and switch account
          </Button>
        </form>
      </>
    )
  }

  return (
    <>
      {heading}
      <div className="mt-8">
        <AcceptButton
          action={acceptInviteAction.bind(null, token)}
          label={`Join ${preview.workspaceName}`}
        />
      </div>
    </>
  )
}
