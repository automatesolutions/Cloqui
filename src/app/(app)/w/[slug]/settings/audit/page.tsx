import type { Metadata } from "next"
import { ScrollText } from "lucide-react"
import { EmptyState } from "@/components/app/empty-state"
import { AccessDenied } from "@/components/privacy/access-denied"
import { requireUser } from "@/server/auth"
import { getWorkspaceAccess, roleCan } from "@/server/authz"
import { listAuditEvents, profileNames } from "@/server/workspaces"

export const metadata: Metadata = { title: "Audit log" }

const timeFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

type Event = Awaited<ReturnType<typeof listAuditEvents>>[number]

function describe(e: Event, names: Map<string, string>): string {
  const actor = e.actorName ?? "Someone"
  const m = e.metadata as Record<string, string | null>
  const target =
    (e.targetType === "user" && e.targetId && names.get(e.targetId)) || m.name || "a person"
  switch (e.action) {
    case "workspace.created":
      return `${actor} created the workspace`
    case "workspace.updated":
      return m.allowedEmailDomain
        ? `${actor} updated workspace settings (only @${m.allowedEmailDomain} can join)`
        : `${actor} updated workspace settings`
    case "member.invited":
      return `${actor} invited someone as ${m.role}`
    case "member.invite_revoked":
      return `${actor} canceled an invite`
    case "member.joined":
      return `${actor} joined as ${m.role}`
    case "member.role_changed":
      return `${actor} changed ${target}'s role from ${m.from} to ${m.to}`
    case "member.removed":
      return `${actor} removed ${target}`
    case "workspace.exported":
      return `${actor} downloaded a workspace export`
    case "security.2fa_required":
      return `${actor} made two-step sign-in required`
    case "security.2fa_optional":
      return `${actor} made two-step sign-in optional`
    case "security.retention_changed":
      return `${actor} changed how long videos and messages are kept`
    case "security.public_links_allowed":
      return `${actor} allowed public links to videos`
    case "security.public_links_blocked":
      return `${actor} turned off public links to videos`
    case "video.public_link_on":
      return `${actor} turned on a public link for a video`
    case "video.public_link_off":
      return `${actor} turned off a public link for a video`
    default:
      return `${actor}: ${e.action}`
  }
}

export default async function AuditPage({ params }: PageProps<"/w/[slug]/settings/audit">) {
  const { slug } = await params
  const user = await requireUser()
  const access = await getWorkspaceAccess(user, slug)
  if (!access) return null
  if (!roleCan(access.role, "audit.view")) {
    return <AccessDenied body="Only workspace admins can see the audit log." />
  }

  const events = await listAuditEvents(user, slug)
  const userIds = events
    .filter((e) => e.targetType === "user" && e.targetId)
    .map((e) => e.targetId!)
  const names = await profileNames(user, [...new Set(userIds)])

  if (events.length === 0) {
    return (
      <EmptyState
        icon={ScrollText}
        title="No activity yet"
        body="Changes to members and settings show up here."
      />
    )
  }

  return (
    <section aria-labelledby="audit-h">
      <h2 id="audit-h" className="sr-only">
        Recent activity
      </h2>
      <p className="mb-4 text-callout text-fg-secondary">
        Who changed what, newest first. Only admins can see this, and nobody can edit it.
      </p>
      <ol className="divide-y divide-border rounded-lg border border-border bg-surface">
        {events.map((e) => (
          <li
            key={e.id}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3"
          >
            <span className="text-callout">{describe(e, names)}</span>
            <time
              dateTime={e.createdAt.toISOString()}
              className="text-footnote text-fg-secondary tnum"
            >
              {timeFmt.format(e.createdAt)}
            </time>
          </li>
        ))}
      </ol>
    </section>
  )
}
