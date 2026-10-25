import type { Metadata } from "next"
import Link from "next/link"
import { AtSign, Bell, MessageSquare, MessageSquareReply } from "lucide-react"
import { EmptyState } from "@/components/app/empty-state"
import { PageHeader } from "@/components/app/page-header"
import { Button } from "@/components/ui/button"
import { relativeDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import { requireUser } from "@/server/auth"
import { listNotifications } from "@/server/chat"
import { markAllReadAction } from "./actions"

export const metadata: Metadata = { title: "Notifications" }

type Item = Awaited<ReturnType<typeof listNotifications>>[number]

const kinds: Record<string, { icon: typeof Bell; text: (actor: string) => string }> = {
  mention: { icon: AtSign, text: (a) => `${a} mentioned you` },
  dm: { icon: MessageSquare, text: (a) => `${a} sent you a message` },
  reply: { icon: MessageSquareReply, text: (a) => `${a} replied in a thread` },
}

function hrefFor(n: Item) {
  if (n.targetType === "chat_message" && n.channelId) {
    return `/w/${n.workspaceSlug}/chat/${n.channelId}?thread=${n.targetId}`
  }
  if (n.targetType === "task") return `/w/${n.workspaceSlug}/tasks?task=${n.targetId}`
  return `/w/${n.workspaceSlug}`
}

export default async function NotificationsPage({ params }: PageProps<"/w/[slug]/notifications">) {
  const { slug } = await params
  const user = await requireUser()
  const items = await listNotifications(user)
  const unread = items.filter((n) => !n.readAt).length
  return (
    <>
      <PageHeader
        title="Notifications"
        description="Mentions, direct messages and replies. Only you can see these."
        actions={
          unread > 0 && (
            <form action={markAllReadAction.bind(null, slug)}>
              <Button type="submit" variant="secondary">
                Mark all as read
              </Button>
            </form>
          )
        }
      />
      {items.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="You're all caught up"
          body="When someone mentions you or sends you a message, it shows up here."
        />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {items.map((n) => {
            const k = kinds[n.kind] ?? {
              icon: Bell,
              text: (a: string) => `${a} needs your attention`,
            }
            return (
              <li key={n.id}>
                <Link href={hrefFor(n)} className="flex gap-3 px-4 py-3 hover:bg-raised">
                  <span
                    aria-hidden
                    className={cn(
                      "mt-2 size-2 shrink-0 rounded-full",
                      n.readAt ? "bg-transparent" : "bg-brand"
                    )}
                  />
                  <k.icon
                    aria-hidden
                    className="mt-0.5 size-5 shrink-0 text-fg-secondary"
                    strokeWidth={1.75}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-callout">
                      <span className={cn(!n.readAt && "font-semibold")}>
                        {k.text(n.actorName)}
                      </span>
                      {!n.readAt && <span className="sr-only"> (unread)</span>}
                    </span>
                    {n.preview && (
                      <span className="mt-0.5 line-clamp-2 block text-footnote text-fg-secondary">
                        {n.preview}
                      </span>
                    )}
                    <span className="mt-0.5 block text-caption text-fg-muted tnum">
                      {relativeDate(n.createdAt)}
                    </span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
