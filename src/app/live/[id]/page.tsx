import type { Metadata } from "next"
import { Suspense } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Logo } from "@/components/brand/logo"
import { UserMenu } from "@/components/app/shell-menus"
import { AccessDenied } from "@/components/privacy/access-denied"
import { Button } from "@/components/ui/button"
import { requireUser } from "@/server/auth"
import { getLiveRoomView } from "@/server/live"
import { LiveRoom } from "./live-room"

export const metadata: Metadata = { title: "Live room", referrer: "no-referrer" }

export default function LiveRoomPage({ params }: PageProps<"/live/[id]">) {
  return (
    <Suspense fallback={<div aria-busy className="min-h-dvh" />}>
      <Body params={params} />
    </Suspense>
  )
}

async function Body({ params }: { params: PageProps<"/live/[id]">["params"] }) {
  const { id } = await params
  const user = await requireUser(`/live/${id}`)
  const view = /^[0-9a-f-]{36}$/i.test(id)
    ? await getLiveRoomView(user, id)
    : ({ kind: "denied" } as const)
  const back =
    view.kind === "ok" && view.workspace.isMember
      ? { href: `/w/${view.workspace.slug}/live`, label: view.workspace.name }
      : undefined

  return (
    <div className="flex min-h-dvh flex-col pt-[env(safe-area-inset-top)]">
      <header className="flex h-14 items-center gap-2 border-b border-border px-4">
        {back ? (
          <Button variant="ghost" asChild className="-ml-2 min-w-0">
            <Link href={back.href}>
              <ArrowLeft aria-hidden />
              <span className="truncate">{back.label}</span>
            </Link>
          </Button>
        ) : (
          <Link
            href="/home"
            aria-label="Cloqui home"
            className="-ml-1 inline-flex h-11 items-center rounded-md px-1"
          >
            <Logo />
          </Link>
        )}
        <div className="flex-1" />
        <UserMenu name={user.displayName} email={user.email} />
      </header>
      <main id="main" className="flex flex-1 flex-col">
        {view.kind === "denied" ? (
          <div className="flex flex-1 items-center justify-center">
            <AccessDenied body="Only people the host invited can join this room." />
          </div>
        ) : view.kind === "ended" ? (
          <div className="flex flex-1 items-center justify-center px-4 text-center">
            <div>
              <h1 className="text-title-2 font-bold">This room has ended</h1>
              <p className="mt-2 text-callout text-fg-secondary">
                &ldquo;{view.title}&rdquo; is closed.
              </p>
            </div>
          </div>
        ) : (
          <LiveRoom
            roomId={id}
            title={view.room.title}
            hostName={view.role === "host" ? "you" : view.hostName.split(" ")[0]}
            isManager={view.role === "host" || view.role === "cohost"}
            isHost={view.role === "host"}
            locked={view.room.locked}
            audience={
              view.room.workspaceVisible
                ? { label: `Everyone in ${view.workspace.name}`, scope: "workspace", people: false }
                : { label: "Invited people only", scope: "private", people: true }
            }
            backHref={back?.href ?? "/home"}
          />
        )}
      </main>
    </div>
  )
}
