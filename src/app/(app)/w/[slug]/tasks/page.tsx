import type { Metadata } from "next"
import Link from "next/link"
import { CircleCheck } from "lucide-react"
import { EmptyState } from "@/components/app/empty-state"
import { DueDate, PriorityTag, type Priority } from "@/components/tasks/bits"
import { TaskDrawer } from "@/components/tasks/task-drawer"
import { requireUser } from "@/server/auth"
import { myTasks } from "@/server/tasks"

export const metadata: Metadata = { title: "My tasks" }

export default async function MyTasksPage({ params }: PageProps<"/w/[slug]/tasks">) {
  const { slug } = await params
  const user = await requireUser(`/w/${slug}/tasks`)
  const items = await myTasks(user, slug)
  return (
    // On phones this sits under the spaces list; on desktop it fills the main area.
    <div className="min-w-0 flex-1 px-4 py-6 md:px-8 lg:overflow-y-auto">
      <h1 className="text-title-2 font-bold">My tasks</h1>
      <p className="mt-1 text-callout text-fg-secondary">
        Open tasks assigned to you, soonest due first.
      </p>
      <div className="mt-6">
        {items.length === 0 ? (
          <EmptyState
            icon={CircleCheck}
            title="Nothing assigned to you"
            body="When someone assigns you a task, it shows up here."
          />
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {items.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/w/${slug}/tasks/${t.listId}?task=${t.id}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-raised"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-callout font-medium">{t.title}</span>
                    <span className="block text-footnote text-fg-secondary">
                      {t.listName} · {t.statusName}
                    </span>
                  </span>
                  <PriorityTag p={t.priority as Priority} />
                  <DueDate date={t.dueDate} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <TaskDrawer slug={slug} />
    </div>
  )
}
