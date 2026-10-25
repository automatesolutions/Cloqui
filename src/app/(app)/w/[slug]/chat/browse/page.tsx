import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Compass, Hash } from "lucide-react"
import { EmptyState } from "@/components/app/empty-state"
import { ActionButton } from "@/components/forms/action-button"
import { Button } from "@/components/ui/button"
import { requireUser } from "@/server/auth"
import { listBrowsableChannels } from "@/server/chat"
import { joinChannelAction } from "../actions"

export const metadata: Metadata = { title: "Browse channels" }

export default async function BrowsePage({ params }: PageProps<"/w/[slug]/chat/browse">) {
  const { slug } = await params
  const user = await requireUser()
  const channels = await listBrowsableChannels(user, slug)
  return (
    <div className="min-w-0 flex-1 overflow-y-auto px-4 py-6 md:px-8">
      <Button variant="ghost" asChild className="mb-2 -ml-2 lg:hidden">
        <Link href={`/w/${slug}/chat`}>
          <ArrowLeft aria-hidden />
          Conversations
        </Link>
      </Button>
      <h1 className="text-title-2 font-bold">Browse channels</h1>
      <p className="mt-1 text-callout text-fg-secondary">
        Open channels anyone in the workspace can join. Private channels never show up here.
      </p>
      <div className="mt-6">
        {channels.length === 0 ? (
          <EmptyState
            icon={Compass}
            title="You're in every open channel"
            body="Create a new one from the sidebar."
          />
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {channels.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Hash aria-hidden className="size-5 text-fg-secondary" strokeWidth={1.75} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-callout font-medium">{c.name}</p>
                  <p className="truncate text-footnote text-fg-secondary">
                    {c.memberCount} {c.memberCount === 1 ? "member" : "members"}
                    {c.topic ? ` · ${c.topic}` : ""}
                  </p>
                </div>
                <ActionButton
                  variant="secondary"
                  size="sm"
                  action={joinChannelAction.bind(null, slug, c.id)}
                >
                  Join
                </ActionButton>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
