import Link from "next/link"
import { KeyRound, Loader2, TriangleAlert, Video } from "lucide-react"
import { AccessChip } from "@/components/privacy/access-chip"
import { audienceLabel } from "@/lib/audience"
import { formatDuration, relativeDate } from "@/lib/format"
import type { LibraryItem } from "@/server/videos"

export function VideoCard({
  item,
  viewerId,
  workspaceName,
}: {
  item: LibraryItem
  viewerId: string
  workspaceName: string
}) {
  const viewerIsOwner = item.ownerId === viewerId
  const others = Array.from({ length: item.shareCount }, (_, i) => ({
    name: i === 0 ? (item.firstShareName ?? "Someone") : "",
  }))
  const audience = audienceLabel({
    viewerIsOwner,
    workspaceVisible: item.workspaceVisible,
    workspaceName,
    others,
  })
  return (
    <article className="group relative overflow-hidden rounded-lg border border-border bg-surface shadow-sm transition-colors duration-150 hover:border-border-strong">
      <div className="relative aspect-video bg-raised">
        {item.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL; next/image would cache it
          <img src={item.thumbnailUrl} alt="" className="size-full object-cover" loading="lazy" />
        ) : (
          <div className="grid size-full place-items-center text-fg-muted">
            <Video aria-hidden className="size-8" strokeWidth={1.5} />
          </div>
        )}
        <div className="absolute top-2.5 left-2.5">
          <AccessChip
            label={audience.label}
            scope={audience.scope}
            people={audience.people}
            className="backdrop-blur-sm"
          />
        </div>
        {item.status === "processing" && (
          <span className="absolute right-2.5 bottom-2.5 inline-flex items-center gap-1.5 rounded-sm bg-[rgb(14_20_32/.78)] px-2 py-0.5 text-caption text-[#e8edf5]">
            <Loader2 aria-hidden className="size-3.5 animate-spin" />
            Processing
          </span>
        )}
        {item.status === "failed" && (
          <span className="absolute right-2.5 bottom-2.5 inline-flex items-center gap-1.5 rounded-sm bg-[rgb(14_20_32/.78)] px-2 py-0.5 text-caption text-[#f2b54a]">
            <TriangleAlert aria-hidden className="size-3.5" />
            Couldn&apos;t process
          </span>
        )}
        {item.status === "ready" && item.durationMs && (
          <span className="absolute right-2.5 bottom-2.5 rounded-sm bg-[rgb(14_20_32/.78)] px-2 py-0.5 text-caption text-[#e8edf5] tnum">
            {formatDuration(item.durationMs)}
          </span>
        )}
      </div>
      <div className="p-4">
        <h3 className="flex items-center gap-1.5 text-headline">
          <Link
            href={`/v/${item.id}`}
            className="line-clamp-1 after:absolute after:inset-0 after:content-['']"
          >
            {item.title}
          </Link>
          {item.hasPasscode && (
            <KeyRound
              aria-label="Needs a passcode"
              className="size-4 shrink-0 text-fg-muted"
              strokeWidth={1.75}
            />
          )}
        </h3>
        <p className="mt-0.5 text-footnote text-fg-secondary">
          {viewerIsOwner ? "You" : item.ownerName} · {relativeDate(item.createdAt)}
        </p>
      </div>
    </article>
  )
}
