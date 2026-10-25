import Link from "next/link"
import { CircleDot, ListChecks, Radio, UserPlus, Video } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/app/empty-state"
import { AccessChip } from "@/components/privacy/access-chip"
import { requireUser } from "@/server/auth"
import { getWorkspaceAccess, roleCan } from "@/server/authz"
import { listMembers } from "@/server/workspaces"

export default async function WorkspaceHome({ params }: PageProps<"/w/[slug]">) {
  const { slug } = await params
  const user = await requireUser(`/w/${slug}`)
  const access = await getWorkspaceAccess(user, slug)
  if (!access) return null // The layout already shows the access-denied screen.

  const members = await listMembers(user, slug)
  const firstName = user.displayName.split(" ")[0]
  const canInvite = roleCan(access.role, "members.invite")

  return (
    <>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-title-1 font-bold max-md:text-title-2">Hi, {firstName}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-callout text-fg-secondary">
            {access.workspace.name}
            <AccessChip
              label={`${members.length} ${members.length === 1 ? "person" : "people"}`}
              people
            />
          </p>
        </div>
        <Button asChild className="max-lg:hidden">
          <Link href={`/w/${slug}/record`}>
            <CircleDot aria-hidden />
            Record
          </Link>
        </Button>
      </div>

      {canInvite && members.length === 1 && (
        <section
          aria-labelledby="invite-title"
          className="mb-8 flex flex-wrap items-center gap-4 rounded-lg border border-border bg-surface p-5 shadow-sm max-sm:items-start"
        >
          <span className="grid size-10 place-items-center rounded-md bg-brand-soft text-brand-ink">
            <UserPlus aria-hidden className="size-5" strokeWidth={1.75} />
          </span>
          <div className="min-w-[14rem] flex-1">
            <h2 id="invite-title" className="font-sans text-headline">
              It&apos;s only you here
            </h2>
            <p className="text-callout text-fg-secondary">
              Invite the people you work with. Nobody else can join.
            </p>
          </div>
          <Button variant="secondary" asChild className="max-sm:w-full">
            <Link href={`/w/${slug}/settings/members`}>Invite people</Link>
          </Button>
        </section>
      )}

      <div className="grid gap-8">
        <section aria-labelledby="recent-title">
          <h2 id="recent-title" className="mb-4 text-title-3 font-medium">
            Recent videos
          </h2>
          <EmptyState
            icon={Video}
            title="No videos yet"
            body="Record your screen or camera. Only the people you choose can watch it."
            action={
              <Button variant="secondary" asChild>
                <Link href={`/w/${slug}/record`}>Record a video</Link>
              </Button>
            }
          />
        </section>
        <div className="grid gap-8 md:grid-cols-2">
          <section aria-labelledby="live-title">
            <h2 id="live-title" className="mb-4 text-title-3 font-medium">
              Live now
            </h2>
            <EmptyState
              icon={Radio}
              title="Nobody is live"
              body="Live rooms you're invited to show up here."
            />
          </section>
          <section aria-labelledby="tasks-title">
            <h2 id="tasks-title" className="mb-4 text-title-3 font-medium">
              My tasks
            </h2>
            <EmptyState
              icon={ListChecks}
              title="Nothing assigned to you"
              body="Tasks assigned to you show up here."
            />
          </section>
        </div>
      </div>
    </>
  )
}
