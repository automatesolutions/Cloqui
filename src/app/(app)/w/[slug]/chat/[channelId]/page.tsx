import type { Metadata } from "next"
import { AccessDenied } from "@/components/privacy/access-denied"
import { requireUser } from "@/server/auth"
import { getChannelView, listMessages, listPinned } from "@/server/chat"
import { listLibrary } from "@/server/videos"
import { listMembers } from "@/server/workspaces"
import { ChannelHeader } from "./channel-header"
import { Conversation } from "./conversation"

export const metadata: Metadata = { title: "Chat" }

export default async function ChannelPage({ params }: PageProps<"/w/[slug]/chat/[channelId]">) {
  const { slug, channelId } = await params
  const user = await requireUser(`/w/${slug}/chat/${channelId}`)
  const view = /^[0-9a-f-]{36}$/i.test(channelId) ? await getChannelView(user, channelId) : null
  if (!view) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <AccessDenied body="This is a private conversation. Only the people in it can read it." />
      </div>
    )
  }
  const openChannel = view.channel.kind === "channel" && !view.channel.isPrivate
  const [messages, pinned, library, workspaceMembers] = await Promise.all([
    listMessages(user, channelId),
    listPinned(user, channelId),
    listLibrary(user, slug, "all", 30),
    openChannel ? listMembers(user, slug) : Promise.resolve([]),
  ])
  // Who can be @mentioned: anyone who can read the conversation.
  const mentionable = openChannel
    ? workspaceMembers
        .filter((m) => m.role !== "guest")
        .map((m) => ({ id: m.userId, name: m.displayName, email: m.email }))
    : view.members
  const others = view.members.filter((m) => m.id !== user.id)
  const audience =
    view.channel.kind === "dm"
      ? {
          label:
            others.length === 1
              ? `You and ${others[0].name.split(" ")[0]}`
              : `${view.members.length} people`,
          scope: "private" as const,
          people: others.length > 1,
        }
      : view.channel.isPrivate
        ? {
            label: `${view.members.length} ${view.members.length === 1 ? "person" : "people"}`,
            scope: "private" as const,
            people: true,
          }
        : { label: `Everyone in ${view.workspaceName}`, scope: "workspace" as const, people: false }

  return (
    <Conversation
      key={channelId}
      slug={slug}
      channelId={channelId}
      me={{ id: user.id, name: user.displayName }}
      initial={messages}
      members={mentionable}
      canPost={!view.channel.archivedAt}
      myVideos={library
        .filter((v) => v.status !== "failed")
        .map((v) => ({ id: v.id, title: v.title, isOwner: v.ownerId === user.id }))}
      header={
        <ChannelHeader
          slug={slug}
          channelId={channelId}
          kind={view.channel.kind}
          isPrivate={view.channel.isPrivate}
          title={view.title}
          topic={view.channel.topic}
          audience={audience}
          members={view.members}
          pinned={pinned}
          notify={view.notify}
          isMember={view.isMember}
        />
      }
    />
  )
}
