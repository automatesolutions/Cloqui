import type { Metadata } from "next"
import { Suspense } from "react"
import Link from "next/link"
import { Video } from "lucide-react"
import { Logo } from "@/components/brand/logo"
import { EmptyState } from "@/components/app/empty-state"
import { UserMenu } from "@/components/app/shell-menus"
import { Button } from "@/components/ui/button"
import { relativeDate } from "@/lib/format"
import { requireUser } from "@/server/auth"
import { listSharedWithMe } from "@/server/videos"

export const metadata: Metadata = { title: "Shared with you" }

// Home for guests: people who only have single items shared with them, and no workspace.
export default function SharedPage() {
  return (
    <Suspense fallback={null}>
      <Body />
    </Suspense>
  )
}

async function Body() {
  const user = await requireUser("/shared")
  const items = await listSharedWithMe(user)
  return (
    <div className="flex min-h-dvh flex-col pt-[env(safe-area-inset-top)]">
      <header className="container-page flex h-14 items-center justify-between">
        <Link
          href="/shared"
          aria-label="Cloqui home"
          className="-ml-1 inline-flex h-11 items-center rounded-md px-1"
        >
          <Logo />
        </Link>
        <UserMenu name={user.displayName} email={user.email} />
      </header>
      <main id="main" className="container-page flex-1 pt-8 pb-16">
        <h1 className="text-title-1 font-bold max-md:text-title-2">Shared with you</h1>
        <p className="mt-2 text-callout text-fg-secondary">
          Only the things people shared with you directly. Nothing else.
        </p>
        <div className="mt-8">
          {items.length === 0 ? (
            <EmptyState
              icon={Video}
              title="Nothing shared with you yet"
              body="When someone shares a video with you, it shows up here. Want your own space?"
              action={
                <Button variant="secondary" asChild>
                  <Link href="/onboarding">Create a workspace</Link>
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
              {items.map((v) => (
                <li key={v.id}>
                  <Link
                    href={`/v/${v.id}`}
                    className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-raised"
                  >
                    <Video aria-hidden className="size-5 text-fg-secondary" strokeWidth={1.75} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-callout font-medium">{v.title}</span>
                      <span className="block text-footnote text-fg-secondary">
                        {v.ownerName ?? "Someone"} · {relativeDate(v.createdAt)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  )
}
