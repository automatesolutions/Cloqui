import type { Metadata } from "next"
import Link from "next/link"
import { Radio } from "lucide-react"
import { EmptyState } from "@/components/app/empty-state"
import { PageHeader } from "@/components/app/page-header"
import { AccessChip } from "@/components/privacy/access-chip"
import { relativeDate } from "@/lib/format"
import { requireUser } from "@/server/auth"
import { getWorkspaceAccess } from "@/server/authz"
import { listLiveRooms } from "@/server/live"
import { NewRoom } from "./new-room"

export const metadata: Metadata = { title: "Live" }

export default async function LivePage({ params }: PageProps<"/w/[slug]/live">) {
  const { slug } = await params
  const user = await requireUser(`/w/${slug}/live`)
  const access = await getWorkspaceAccess(user, slug)
  if (!access) return null
  const rooms = await listLiveRooms(user, slug)
  return (
    <>
      <PageHeader
        title="Live"
        description="Invite-only rooms with a waiting room."
        actions={<NewRoom slug={slug} workspaceName={access.workspace.name} />}
      />
      {rooms.length === 0 ? (
        <EmptyState
          icon={Radio}
          title="No open rooms"
          body="Start a room and invite the people you need. Nobody else can join."
        />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {rooms.map((r) => (
            <li
              key={r.id}
              className="relative flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-raised"
            >
              {r.isLive ? (
                <span className="inline-flex items-center gap-1.5 rounded-sm bg-danger-soft px-2 py-0.5 text-caption font-medium tracking-[0.06em] text-danger-ink uppercase">
                  <span aria-hidden className="size-2 animate-calm-pulse rounded-full bg-danger" />
                  Live
                </span>
              ) : (
                <Radio aria-hidden className="size-5 text-fg-secondary" strokeWidth={1.75} />
              )}
              <div className="min-w-0 flex-1">
                <Link
                  href={`/live/${r.id}`}
                  className="block truncate text-callout font-medium after:absolute after:inset-0 after:content-['']"
                >
                  {r.title}
                </Link>
                <p className="text-footnote text-fg-secondary">
                  {r.hostId === user.id ? "You" : r.hostName} · {relativeDate(r.createdAt)}
                </p>
              </div>
              <AccessChip
                label={
                  r.workspaceVisible
                    ? `Everyone in ${access.workspace.name}`
                    : `${r.invited + 1} people`
                }
                scope={r.workspaceVisible ? "workspace" : "private"}
                people={!r.workspaceVisible}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
