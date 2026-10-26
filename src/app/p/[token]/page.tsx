import type { Metadata } from "next"
import { Suspense } from "react"
import Link from "next/link"
import { Logo } from "@/components/brand/logo"
import { ClosedDoorArt } from "@/components/privacy/access-denied"
import { Button } from "@/components/ui/button"
import { getPublicView } from "@/server/public-links"
import { PublicWatch } from "./public-watch"

// A public link is meant for the people it's sent to, not for search engines or link previews.
export const metadata: Metadata = {
  title: "Video",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
}

export default function PublicVideoPage({ params }: PageProps<"/p/[token]">) {
  return (
    <div className="flex min-h-dvh flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 px-4 md:px-6">
          <Link
            href="/"
            aria-label="Cloqui home"
            className="-ml-1 inline-flex h-11 items-center rounded-md px-1"
          >
            <Logo />
          </Link>
          <div className="flex-1" />
          <Button variant="ghost" asChild>
            <Link href="/sign-up">Start free</Link>
          </Button>
        </div>
      </header>
      <main id="main" className="flex flex-1 flex-col px-4 pt-6 pb-16 md:px-6">
        <Suspense fallback={<WatchSkeleton />}>
          <Body params={params} />
        </Suspense>
      </main>
    </div>
  )
}

async function Body({ params }: { params: PageProps<"/p/[token]">["params"] }) {
  const { token } = await params
  const view = await getPublicView(token)
  if (view.kind === "none") {
    return (
      <div className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <ClosedDoorArt className="mb-5 h-24 w-30" />
        <h1 className="text-title-3 font-medium">This link doesn&apos;t work</h1>
        <p className="mt-2 text-callout text-fg-secondary">
          The owner turned it off, or it ended. Ask them for a new one.
        </p>
      </div>
    )
  }
  return (
    <PublicWatch
      token={token}
      initial={view.kind === "ok" ? view : null}
      ownerFirstName={view.ownerFirstName}
    />
  )
}

function WatchSkeleton() {
  return (
    <div aria-busy className="mx-auto grid w-full max-w-4xl gap-5">
      <div className="aspect-video rounded-lg bg-raised" />
      <div className="h-8 w-2/3 rounded-md bg-raised" />
    </div>
  )
}
