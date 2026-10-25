import { Suspense } from "react"
import Link from "next/link"
import { Lock, ShieldCheck } from "lucide-react"
import { Logo } from "@/components/brand/logo"
import { MobileTabBar, SidebarNav } from "@/components/app/shell-nav"
import { UserMenu, WorkspaceSwitcher } from "@/components/app/shell-menus"
import { AccessDenied } from "@/components/privacy/access-denied"
import { Button } from "@/components/ui/button"
import { requireUser } from "@/server/auth"
import { getWorkspaceAccess, needsTwoFactorFor } from "@/server/authz"
import { MainFrame } from "@/components/app/main-frame"
import { NotificationBell } from "@/components/app/notification-bell"
import { unreadNotificationCount } from "@/server/chat"
import { listMyWorkspaces } from "@/server/workspaces"

export default function WorkspaceLayout({ children, params }: LayoutProps<"/w/[slug]">) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <Shell params={params}>{children}</Shell>
    </Suspense>
  )
}

async function Shell({
  params,
  children,
}: {
  params: LayoutProps<"/w/[slug]">["params"]
  children: React.ReactNode
}) {
  const { slug } = await params
  const user = await requireUser(`/w/${slug}`)
  const access = await getWorkspaceAccess(user, slug)

  if (!access) {
    const needsTwoFactor = await needsTwoFactorFor(user, slug)
    return (
      <div className="flex min-h-dvh flex-col">
        <header className="container-page flex h-14 items-center">
          <Link
            href="/home"
            aria-label="Cloqui home"
            className="-ml-1 inline-flex h-11 items-center rounded-md px-1"
          >
            <Logo />
          </Link>
        </header>
        <main id="main" className="flex flex-1 items-center justify-center">
          {needsTwoFactor ? (
            <TwoFactorRequired />
          ) : (
            <AccessDenied body="Only people invited to this workspace can open it. Ask one of its admins for an invite." />
          )}
        </main>
      </div>
    )
  }

  const [allWorkspaces, unread] = await Promise.all([
    listMyWorkspaces(user),
    unreadNotificationCount(user),
  ])
  const workspaces = allWorkspaces.filter((w) => w.role !== "guest")
  const current = { name: access.workspace.name, slug: access.workspace.slug }

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-brand px-4 py-3 text-on-brand focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>

      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r border-border bg-surface px-3 py-3 lg:flex">
        <WorkspaceSwitcher current={current} workspaces={workspaces} />
        <SidebarNav slug={slug} />
        <p className="mt-auto flex items-center gap-2 px-3 pb-2 text-footnote text-fg-muted">
          <Lock aria-hidden className="size-4 shrink-0" strokeWidth={1.75} />
          Only members can see this workspace.
        </p>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/90 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-md lg:px-8">
          <div className="min-w-0 flex-1 lg:hidden">
            <WorkspaceSwitcher current={current} workspaces={workspaces} />
          </div>
          <div className="hidden flex-1 lg:block" />
          <NotificationBell key={unread} slug={slug} userId={user.id} initial={unread} />
          <UserMenu name={user.displayName} email={user.email} />
        </header>
        <MainFrame>{children}</MainFrame>
      </div>

      <MobileTabBar slug={slug} />
    </div>
  )
}

function ShellSkeleton() {
  return (
    <div aria-busy className="min-h-dvh lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
      <div className="hidden border-r border-border bg-surface lg:block" />
      <div>
        <div className="h-14 border-b border-border" />
        <div className="mx-auto max-w-5xl px-4 pt-8 lg:px-8">
          <div className="h-10 w-56 rounded-md bg-raised" />
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="h-40 rounded-lg bg-raised" />
            <div className="h-40 rounded-lg bg-raised" />
            <div className="h-40 rounded-lg bg-raised" />
          </div>
        </div>
      </div>
    </div>
  )
}

function TwoFactorRequired() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-16 text-center">
      <ShieldCheck aria-hidden className="mb-5 size-12 text-brand-ink" strokeWidth={1.75} />
      <h1 className="text-title-3 font-medium">Turn on two-step sign-in first</h1>
      <p className="mt-2 text-callout text-fg-secondary">
        This workspace asks everyone to sign in with a code from an authenticator app. Set it up
        once, and you&apos;re in.
      </p>
      <div className="mt-6 flex w-full max-w-[260px] flex-col gap-2">
        <Button asChild>
          <Link href="/account">Set up two-step sign-in</Link>
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/home">Go to Home</Link>
        </Button>
      </div>
    </div>
  )
}
