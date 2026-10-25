import type { Metadata } from "next"
import Link from "next/link"
import { CircleDot, Video } from "lucide-react"
import { EmptyState } from "@/components/app/empty-state"
import { PageHeader } from "@/components/app/page-header"
import { Button } from "@/components/ui/button"
import { VideoCard } from "@/components/video/video-card"
import { cn } from "@/lib/utils"
import { requireUser } from "@/server/auth"
import { getWorkspaceAccess } from "@/server/authz"
import { listLibrary } from "@/server/videos"

export const metadata: Metadata = { title: "Library" }

const filters = [
  { value: "all", label: "All" },
  { value: "mine", label: "Mine" },
  { value: "shared", label: "Shared with me" },
] as const

const empty = {
  all: {
    title: "No videos yet",
    body: "Record your screen or camera. Only the people you choose can watch it.",
  },
  mine: {
    title: "You haven't recorded anything yet",
    body: "Your recordings stay private until you share them.",
  },
  shared: {
    title: "Nothing shared with you yet",
    body: "When someone shares a video with you, it shows up here.",
  },
}

export default async function LibraryPage({
  params,
  searchParams,
}: PageProps<"/w/[slug]/library">) {
  const { slug } = await params
  const sp = await searchParams
  const filter = sp.f === "mine" || sp.f === "shared" ? sp.f : "all"
  const user = await requireUser(`/w/${slug}/library`)
  const access = await getWorkspaceAccess(user, slug)
  if (!access) return null
  const items = await listLibrary(user, slug, filter)

  return (
    <>
      <PageHeader
        title="Library"
        description="Videos you made, and videos shared with you."
        actions={
          <Button asChild>
            <Link href={`/w/${slug}/record`}>
              <CircleDot aria-hidden />
              Record
            </Link>
          </Button>
        }
      />
      <nav aria-label="Filter videos" className="mb-6 flex gap-1 overflow-x-auto">
        {filters.map((f) => (
          <Link
            key={f.value}
            href={f.value === "all" ? `/w/${slug}/library` : `/w/${slug}/library?f=${f.value}`}
            aria-current={filter === f.value ? "page" : undefined}
            className={cn(
              "inline-flex h-11 items-center rounded-full px-4 text-callout font-medium whitespace-nowrap transition-colors duration-150",
              filter === f.value
                ? "bg-brand-soft text-brand-ink"
                : "text-fg-secondary hover:bg-raised hover:text-fg"
            )}
          >
            {f.label}
          </Link>
        ))}
      </nav>
      {items.length === 0 ? (
        <EmptyState
          icon={Video}
          title={empty[filter].title}
          body={empty[filter].body}
          action={
            filter !== "shared" && (
              <Button variant="secondary" asChild>
                <Link href={`/w/${slug}/record`}>Record a video</Link>
              </Button>
            )
          }
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <li key={item.id}>
              <VideoCard item={item} viewerId={user.id} workspaceName={access.workspace.name} />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
