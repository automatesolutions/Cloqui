import type { Metadata } from "next"
import { Suspense } from "react"
import Link from "next/link"
import { ArrowLeft, Loader2, TriangleAlert } from "lucide-react"
import { Logo } from "@/components/brand/logo"
import { UserMenu } from "@/components/app/shell-menus"
import { AccessChip } from "@/components/privacy/access-chip"
import { AccessDenied } from "@/components/privacy/access-denied"
import { Button } from "@/components/ui/button"
import { audienceLabel } from "@/lib/audience"
import { formatDuration, relativeDate } from "@/lib/format"
import { requireUser } from "@/server/auth"
import { getPublicLinkState, hasPublicLink } from "@/server/public-links"
import {
  canSeeVideoActivity,
  getVideoView,
  issuePlayback,
  listAccessRequests,
  listComments,
  listGrants,
  listReactions,
  listVideoActivity,
  shareSuggestions,
} from "@/server/videos"
import { requestAccessFormAction } from "./actions"
import { Comments, Reactions } from "./discussion"
import { PasscodeForm } from "./passcode-form"
import { Player, PlayerProvider } from "./player"
import { SharePanel } from "./share-panel"
import { VideoDetails, VideoTools } from "./video-tools"

// Titles are private: the tab only ever says "Video".
export const metadata: Metadata = { title: "Video", referrer: "no-referrer" }

export default function VideoPage({ params }: PageProps<"/v/[id]">) {
  return (
    <Suspense fallback={<VideoSkeleton />}>
      <VideoBody params={params} />
    </Suspense>
  )
}

async function VideoBody({ params }: { params: PageProps<"/v/[id]">["params"] }) {
  const { id } = await params
  const user = await requireUser(`/v/${id}`)
  const isUuid = /^[0-9a-f-]{36}$/i.test(id)
  const view = isUuid
    ? await getVideoView(user, id)
    : ({ kind: "denied", ownerFirstName: null, requested: false } as const)

  if (view.kind === "denied") {
    return (
      <Chrome user={user}>
        <div className="flex flex-1 items-center justify-center">
          <AccessDenied
            ownerName={view.ownerFirstName ?? undefined}
            requested={view.requested}
            requestAction={isUuid ? requestAccessFormAction.bind(null, id) : undefined}
          />
        </div>
      </Chrome>
    )
  }

  if (view.kind === "passcode") {
    return (
      <Chrome user={user}>
        <div className="flex flex-1 items-center justify-center py-12">
          <PasscodeForm videoId={id} title={view.video.title} ownerName={view.ownerFirstName} />
        </div>
      </Chrome>
    )
  }

  const { video, role, workspace, owner } = view
  const isOwner = role === "owner"
  const canEdit = role === "owner" || role === "editor"
  const [
    playback,
    comments,
    reactions,
    grants,
    requests,
    suggestions,
    showActivity,
    publicLink,
    publicOn,
  ] = await Promise.all([
    issuePlayback(user, id),
    listComments(user, id),
    listReactions(user, id),
    listGrants(user, id),
    listAccessRequests(user, id),
    shareSuggestions(user, id),
    canSeeVideoActivity(user, id, video.workspaceId),
    getPublicLinkState(user, id),
    hasPublicLink(user, id),
  ])
  const activity = showActivity ? await listVideoActivity(user, id) : []
  const audience = audienceLabel({
    viewerIsOwner: isOwner,
    workspaceVisible: video.workspaceVisible,
    workspaceName: workspace.name,
    others: grants.map((g) => ({ name: g.name })),
    publicLink: publicOn,
  })

  const sharePanel = (
    <SharePanel
      videoId={id}
      isOwner={isOwner}
      ownerName={owner.name}
      workspaceName={workspace.name}
      audience={audience}
      grants={grants}
      suggestions={suggestions}
      requests={requests}
      hasPasscode={!!video.passcodeHash}
      publicLink={publicLink}
      settings={{
        workspaceVisible: video.workspaceVisible,
        accessExpiresAt: video.accessExpiresAt
          ? video.accessExpiresAt.toISOString().slice(0, 10)
          : null,
        viewOnly: video.viewOnly,
        watermark: video.watermark,
      }}
    />
  )

  return (
    <Chrome
      user={user}
      back={
        workspace.isMember
          ? { href: `/w/${workspace.slug}/library`, label: workspace.name }
          : undefined
      }
    >
      <PlayerProvider>
        <div className="mx-auto grid w-full max-w-6xl gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="grid min-w-0 content-start gap-6">
            {video.status === "processing" && (
              <p
                role="status"
                className="flex items-center gap-2 rounded-md bg-raised px-4 py-3 text-callout text-fg-secondary"
              >
                <Loader2 aria-hidden className="size-4 animate-spin" />
                We&apos;re preparing a version that plays on every device. It already plays here.
              </p>
            )}
            {video.status === "failed" && (
              <p
                role="status"
                className="flex items-center gap-2 rounded-md bg-attention-soft px-4 py-3 text-callout text-attention"
              >
                <TriangleAlert aria-hidden className="size-4" />
                We couldn&apos;t make a version for every device. The original still plays in most
                browsers.
              </p>
            )}
            <Player
              videoId={id}
              initial={playback}
              title={video.title}
              watermark={video.watermark && !isOwner ? user.email : null}
              viewOnly={video.viewOnly && role === "viewer"}
            />
            <VideoDetails
              videoId={id}
              title={video.title}
              description={video.description}
              canEdit={canEdit}
              meta={
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>{isOwner ? "You" : owner.name}</span>
                  <span aria-hidden>·</span>
                  <span>{relativeDate(video.createdAt)}</span>
                  {video.durationMs ? (
                    <>
                      <span aria-hidden>·</span>
                      <span className="tnum">{formatDuration(video.durationMs)}</span>
                    </>
                  ) : null}
                </span>
              }
            />
            {/* On phones, who can see it stays one tap away, right under the title. */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3 lg:hidden">
              <AccessChip label={audience.label} scope={audience.scope} people={audience.people} />
              {sharePanel}
            </div>
            <Reactions videoId={id} initial={reactions} />
            <Comments videoId={id} comments={comments} viewerId={user.id} />
          </div>

          <aside className="grid content-start gap-6">
            <section
              aria-labelledby="access-h"
              className="grid gap-4 rounded-lg border border-border bg-surface p-5 shadow-sm max-lg:hidden"
            >
              <h2 id="access-h" className="text-headline">
                Sharing
              </h2>
              <AccessChip label={audience.label} scope={audience.scope} people={audience.people} />
              <p className="text-footnote text-fg-secondary">
                {publicOn
                  ? "Anyone with the public link can watch, without signing in."
                  : "Only the people on the list can open this link."}
                {video.accessExpiresAt
                  ? ` Access ends ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(video.accessExpiresAt)}.`
                  : ""}
                {video.passcodeHash ? " A passcode is required." : ""}
                {video.viewOnly ? " View only." : ""}
              </p>
              {sharePanel}
            </section>

            {(canEdit || workspace.isMember || !(video.viewOnly && role === "viewer")) && (
              <section aria-label="Video actions">
                <VideoTools
                  videoId={id}
                  slug={workspace.slug}
                  canEdit={canEdit}
                  isOwner={isOwner}
                  canDownload={!(video.viewOnly && role === "viewer")}
                  title={video.title}
                  inWorkspace={workspace.isMember}
                />
              </section>
            )}

            {showActivity && (
              <section aria-labelledby="activity-h" className="grid gap-3">
                <h2 id="activity-h" className="text-headline">
                  Activity
                </h2>
                <p className="text-footnote text-fg-secondary">
                  Who watched and who changed sharing. Only you and workspace admins see this.
                </p>
                {activity.length === 0 ? (
                  <p className="text-callout text-fg-secondary">Nothing yet.</p>
                ) : (
                  <ol className="divide-y divide-border rounded-lg border border-border bg-surface">
                    {activity.slice(0, 30).map((a) => (
                      <li key={a.id} className="grid gap-0.5 px-4 py-2.5">
                        <span className="text-callout">
                          {describeActivity(a.action, a.actorName, a.metadata)}
                        </span>
                        <time
                          dateTime={a.createdAt.toISOString()}
                          className="text-footnote text-fg-secondary tnum"
                        >
                          {relativeDate(a.createdAt)}
                        </time>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            )}
          </aside>
        </div>
      </PlayerProvider>
    </Chrome>
  )
}

function describeActivity(action: string, actor: string, m: Record<string, unknown>) {
  switch (action) {
    case "video.created":
      return `${actor} uploaded the video`
    case "video.viewed":
      return `${actor} watched`
    case "video.updated":
      return m.trim ? `${actor} trimmed the video` : `${actor} edited the details`
    case "video.shared":
      return `${actor} shared it with ${m.count} ${m.count === 1 ? "person" : "people"} as ${m.role}`
    case "video.unshared":
      return `${actor} removed ${m.name ?? "someone"}'s access`
    case "video.role_changed":
      return `${actor} made ${m.name ?? "someone"} ${m.role === "editor" ? "an editor" : "a viewer"}`
    case "video.settings_changed":
      return m.passcode
        ? `${actor} ${m.passcode === "set" ? "set" : "removed"} the passcode`
        : `${actor} changed sharing settings`
    case "video.access_requested":
      return `${actor} asked for access`
    case "video.access_approved":
      return `${actor} let ${m.name ?? "someone"} watch`
    case "video.access_declined":
      return `${actor} declined ${m.name ?? "a"}'s request`
    case "video.passcode_failed":
      return m.publicLink
        ? "Someone entered a wrong passcode on the public link"
        : `${actor} entered a wrong passcode`
    case "video.public_link_on":
      return `${actor} turned on the public link`
    case "video.public_link_off":
      return `${actor} turned off the public link`
    case "video.viewed_public":
      return "Someone watched through the public link"
    default:
      return `${actor}: ${action}`
  }
}

function Chrome({
  user,
  back,
  children,
}: {
  user: { displayName: string; email: string }
  back?: { href: string; label: string }
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-dvh flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 px-4 md:px-6">
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
        </div>
      </header>
      <main id="main" className="flex flex-1 flex-col px-4 pt-6 pb-16 md:px-6">
        {children}
      </main>
    </div>
  )
}

function VideoSkeleton() {
  return (
    <div
      aria-busy
      className="mx-auto grid w-full max-w-6xl gap-8 px-4 pt-20 md:px-6 lg:grid-cols-[minmax(0,1fr)_340px]"
    >
      <div className="aspect-video rounded-lg bg-raised" />
      <div className="h-48 rounded-lg bg-raised" />
    </div>
  )
}
