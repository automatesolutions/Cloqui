import { requireUser } from "@/server/auth"
import { getWorkspaceAccess } from "@/server/authz"
import { listTaskTree } from "@/server/tasks"
import { listMembers } from "@/server/workspaces"
import { TaskSidebar } from "./task-sidebar"

export default async function TasksLayout({ children, params }: LayoutProps<"/w/[slug]/tasks">) {
  const { slug } = await params
  const user = await requireUser(`/w/${slug}/tasks`)
  const access = await getWorkspaceAccess(user, slug)
  if (!access) return null
  const [tree, members] = await Promise.all([listTaskTree(user, slug), listMembers(user, slug)])
  const people = members
    .filter((m) => m.userId !== user.id && m.role !== "guest")
    .map((m) => ({ id: m.userId, name: m.displayName, email: m.email }))
  return (
    <div className="flex h-[calc(100dvh-7rem-env(safe-area-inset-bottom))] min-h-0 max-lg:flex-col max-lg:overflow-y-auto lg:h-[calc(100dvh-3.5rem)]">
      <TaskSidebar slug={slug} tree={tree} people={people} />
      {children}
    </div>
  )
}
