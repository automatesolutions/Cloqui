import { requireUser } from "@/server/auth"
import { getWorkspaceAccess } from "@/server/authz"
import { listSidebar } from "@/server/chat"
import { listMembers } from "@/server/workspaces"
import { ChatSidebar } from "./chat-sidebar"

export default async function ChatLayout({ children, params }: LayoutProps<"/w/[slug]/chat">) {
  const { slug } = await params
  const user = await requireUser(`/w/${slug}/chat`)
  const access = await getWorkspaceAccess(user, slug)
  if (!access) return null
  const [sidebar, members] = await Promise.all([listSidebar(user, slug), listMembers(user, slug)])
  const people = members
    .filter((m) => m.userId !== user.id && m.role !== "guest")
    .map((m) => ({ id: m.userId, name: m.displayName, email: m.email }))
  return (
    // Header is 3.5rem; on phones the tab bar takes another 3.5rem plus the home-indicator area.
    <div className="flex h-[calc(100dvh-7rem-env(safe-area-inset-bottom))] min-h-0 lg:h-[calc(100dvh-3.5rem)]">
      <ChatSidebar slug={slug} channels={sidebar.channels} dms={sidebar.dms} people={people} />
      {children}
    </div>
  )
}
