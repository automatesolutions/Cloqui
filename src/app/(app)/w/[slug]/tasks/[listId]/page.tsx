import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Hash } from "lucide-react"
import { AccessChip } from "@/components/privacy/access-chip"
import { AccessDenied } from "@/components/privacy/access-denied"
import { Button } from "@/components/ui/button"
import { ListToolbar } from "@/components/tasks/list-toolbar"
import { TaskDrawer } from "@/components/tasks/task-drawer"
import {
  BoardView,
  CalendarView,
  ListView,
  LiveRefresh,
  TimelineView,
} from "@/components/tasks/views"
import { requireUser } from "@/server/auth"
import type { TaskFilters, TaskPriority } from "@/server/db/schema"
import { getListView, listSavedViews, listTasks } from "@/server/tasks"

export const metadata: Metadata = { title: "Tasks" }

const PRIORITIES = ["urgent", "high", "normal", "low", "none"]
const UUID = /^[0-9a-f-]{36}$/i

function mondayOf(d: Date) {
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  m.setUTCDate(m.getUTCDate() - ((m.getUTCDay() + 6) % 7))
  return m.toISOString().slice(0, 10)
}

export default async function ListPage({
  params,
  searchParams,
}: PageProps<"/w/[slug]/tasks/[listId]">) {
  const { slug, listId } = await params
  const sp = await searchParams
  const user = await requireUser(`/w/${slug}/tasks/${listId}`)
  const view = UUID.test(listId) ? await getListView(user, listId) : null
  if (!view) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <AccessDenied body="This list is in a private space. Only its members can see it." />
      </div>
    )
  }

  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined)
  const filters: TaskFilters = {
    assignee:
      str("assignee") === "me" || UUID.test(str("assignee") ?? "") ? str("assignee") : undefined,
    priority: str("priority")
      ?.split(",")
      .filter((p): p is TaskPriority => PRIORITIES.includes(p)),
    labelId: UUID.test(str("label") ?? "") ? str("label") : undefined,
    status: (["todo", "in_progress", "done"] as const).find((s) => s === str("status")),
    q: str("q")?.slice(0, 100),
  }
  const mode = (["board", "calendar", "timeline"] as const).find((v) => v === str("view")) ?? "list"
  const [rows, saved] = await Promise.all([
    listTasks(user, listId, filters),
    listSavedViews(user, listId),
  ])
  const month = /^\d{4}-\d{2}$/.test(str("month") ?? "")
    ? str("month")!
    : new Date().toISOString().slice(0, 7)
  const from = /^\d{4}-\d{2}-\d{2}$/.test(str("from") ?? "")
    ? mondayOf(new Date(`${str("from")}T00:00:00Z`))
    : mondayOf(new Date())

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="grid gap-3 border-b border-border px-4 py-3 md:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="icon" variant="ghost" asChild className="lg:hidden">
            <Link href={`/w/${slug}/tasks`} aria-label="All task lists">
              <ArrowLeft />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <p className="text-footnote text-fg-secondary">{view.space.name}</p>
            <h1 className="truncate text-title-3 font-medium">{view.list.name}</h1>
          </div>
          {view.channel && (
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/w/${slug}/chat/${view.channel.id}`}>
                <Hash aria-hidden />
                {view.channel.name}
              </Link>
            </Button>
          )}
          <AccessChip
            label={
              view.space.isPrivate
                ? `${view.people.length} ${view.people.length === 1 ? "person" : "people"}`
                : "Everyone in the workspace"
            }
            scope={view.space.isPrivate ? "private" : "workspace"}
            people={view.space.isPrivate}
          />
        </div>
        <ListToolbar
          listId={listId}
          people={view.people}
          labels={view.labels}
          saved={saved.map((s) => ({
            id: s.id,
            name: s.name,
            view: s.view,
            filters: s.filters as Record<string, unknown>,
          }))}
        />
      </header>
      <div className="min-h-0 flex-1 overflow-auto px-4 py-4 md:px-6">
        {mode === "list" && <ListView listId={listId} statuses={view.statuses} tasks={rows} />}
        {mode === "board" && (
          <BoardView
            key={rows.map((r) => `${r.id}:${r.statusId}:${r.position}`).join("|")}
            listId={listId}
            statuses={view.statuses}
            tasks={rows}
          />
        )}
        {mode === "calendar" && <CalendarView tasks={rows} month={month} />}
        {mode === "timeline" && <TimelineView tasks={rows} from={from} />}
      </div>
      <TaskDrawer slug={slug} />
      <LiveRefresh listId={listId} />
    </div>
  )
}
