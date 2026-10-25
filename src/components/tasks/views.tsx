"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  ChevronLeft,
  ChevronRight,
  ListChecks,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Video,
} from "lucide-react"
import { toast } from "sonner"
import {
  moveTaskAction,
  quickAddAction,
  updateTaskAction,
} from "@/app/(app)/w/[slug]/tasks/actions"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { supabaseBrowser } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import type { TaskRow } from "@/server/tasks"
import { Avatars, DueDate, LabelChip, PriorityTag, StatusIcon, type Priority } from "./bits"

type Status = { id: string; name: string; kind: "todo" | "in_progress" | "done"; position: number }

/** Re-render when someone else changes a task in this list. */
export function LiveRefresh({ listId }: { listId: string }) {
  const router = useRouter()
  useEffect(() => {
    const supabase = supabaseBrowser()
    let t: ReturnType<typeof setTimeout> | undefined
    const ch = supabase
      .channel(`tasks:${listId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks", filter: `list_id=eq.${listId}` },
        () => {
          clearTimeout(t)
          t = setTimeout(() => router.refresh(), 300)
        }
      )
      .subscribe()
    return () => {
      clearTimeout(t)
      void supabase.removeChannel(ch)
    }
  }, [listId, router])
  return null
}

function useOpenTask() {
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()
  return (id: string) => {
    const params = new URLSearchParams(search.toString())
    params.set("task", id)
    router.push(`${pathname}?${params.toString()}`, { scroll: false })
  }
}

function TaskMeta({ t }: { t: TaskRow }) {
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {t.labels.map((l) => (
        <LabelChip key={l.id} name={l.name} tone={l.tone} />
      ))}
      <PriorityTag p={t.priority as Priority} compact />
      <DueDate date={t.dueDate} done={!!t.completedAt} />
      {t.subtaskCount > 0 && (
        <span className="inline-flex items-center gap-1 text-footnote text-fg-secondary tnum">
          <ListChecks aria-hidden className="size-3.5" strokeWidth={1.75} />
          {t.subtasksDone}/{t.subtaskCount}
          <span className="sr-only"> subtasks done</span>
        </span>
      )}
      {t.commentCount > 0 && (
        <span className="inline-flex items-center gap-1 text-footnote text-fg-secondary tnum">
          <MessageSquare aria-hidden className="size-3.5" strokeWidth={1.75} />
          {t.commentCount}
          <span className="sr-only"> comments</span>
        </span>
      )}
      {t.hasVideo && (
        <Video aria-label="Has a video" className="size-3.5 text-fg-secondary" strokeWidth={1.75} />
      )}
    </span>
  )
}

function QuickAdd({
  listId,
  statusId,
  label,
}: {
  listId: string
  statusId?: string
  label: string
}) {
  const [title, setTitle] = useState("")
  const [pending, start] = useTransition()
  const router = useRouter()
  const inputId = `add-${statusId ?? "x"}`
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (!title.trim()) return
        start(async () => {
          const r = await quickAddAction(listId, title, statusId)
          if (!r.ok) return void toast.error(r.message)
          setTitle("")
          router.refresh()
        })
      }}
    >
      <Label htmlFor={inputId} className="sr-only">
        {label}
      </Label>
      <Input
        id={inputId}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Add a task"
        maxLength={300}
        disabled={pending}
      />
      <Button
        type="submit"
        variant="ghost"
        size="icon"
        aria-label="Add task"
        disabled={!title.trim() || pending}
      >
        <Plus />
      </Button>
    </form>
  )
}

// ── List ────────────────────────────────────────────────────────────────────

export function ListView({
  listId,
  statuses,
  tasks,
}: {
  listId: string
  statuses: Status[]
  tasks: TaskRow[]
}) {
  const open = useOpenTask()
  const router = useRouter()
  const [, start] = useTransition()
  const done = statuses.find((s) => s.kind === "done")
  return (
    <div className="grid gap-6">
      {statuses.map((s) => {
        const items = tasks.filter((t) => t.statusId === s.id)
        return (
          <section key={s.id} aria-labelledby={`st-${s.id}`}>
            <h2
              id={`st-${s.id}`}
              className="mb-2 flex items-center gap-2 font-sans text-callout font-semibold"
            >
              <StatusIcon kind={s.kind} />
              {s.name}
              <span className="font-normal text-fg-muted tnum">{items.length}</span>
            </h2>
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
              {items.map((t) => (
                <li key={t.id} className="flex items-start gap-2 px-2 py-1.5">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={
                      t.completedAt ? `Mark "${t.title}" as not done` : `Mark "${t.title}" as done`
                    }
                    aria-pressed={!!t.completedAt}
                    onClick={() =>
                      start(async () => {
                        const r = await updateTaskAction(t.id, {
                          statusId: t.completedAt ? statuses[0].id : done!.id,
                        })
                        if (!r.ok) toast.error(r.message)
                        router.refresh()
                      })
                    }
                  >
                    <StatusIcon kind={t.completedAt ? "done" : "todo"} className="size-5" />
                  </Button>
                  <button
                    type="button"
                    onClick={() => open(t.id)}
                    className="min-h-11 min-w-0 flex-1 rounded-sm py-1.5 text-left hover:bg-raised/60"
                  >
                    <span
                      className={cn(
                        "block text-callout",
                        t.completedAt && "text-fg-secondary line-through"
                      )}
                    >
                      {t.title}
                    </span>
                    <TaskMeta t={t} />
                  </button>
                  <span className="pt-2.5">
                    <Avatars people={t.assignees} />
                  </span>
                </li>
              ))}
              <li className="px-2 py-1.5">
                <QuickAdd listId={listId} statusId={s.id} label={`Add a task to ${s.name}`} />
              </li>
            </ul>
          </section>
        )
      })}
    </div>
  )
}

// ── Board ───────────────────────────────────────────────────────────────────

export function BoardView({
  statuses,
  tasks: initial,
  listId,
}: {
  statuses: Status[]
  tasks: TaskRow[]
  listId: string
}) {
  const [tasks, setTasks] = useState(initial)
  const [announce, setAnnounce] = useState("")
  const router = useRouter()
  // The page remounts this board (via key) when fresh data arrives, so local state starts clean.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const byStatus = useMemo(() => {
    const m = new Map<string, TaskRow[]>()
    for (const s of statuses)
      m.set(
        s.id,
        tasks.filter((t) => t.statusId === s.id).sort((a, b) => a.position - b.position)
      )
    return m
  }, [tasks, statuses])

  async function place(taskId: string, statusId: string, index: number) {
    const column = (byStatus.get(statusId) ?? []).filter((t) => t.id !== taskId)
    const before = column[index - 1]?.position
    const after = column[index]?.position
    const position =
      before !== undefined && after !== undefined
        ? (before + after) / 2
        : before !== undefined
          ? before + 1000
          : after !== undefined
            ? after - 1000
            : Date.now()
    setTasks((cur) => cur.map((t) => (t.id === taskId ? { ...t, statusId, position } : t)))
    const status = statuses.find((s) => s.id === statusId)
    setAnnounce(`Moved to ${status?.name}`)
    const r = await moveTaskAction(taskId, statusId, position)
    if (!r.ok) {
      toast.error(r.message)
      setTasks(initial)
    } else router.refresh()
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over) return
    const overId = String(over.id)
    const target = statuses.find((s) => s.id === overId)
    if (target)
      return void place(String(active.id), target.id, (byStatus.get(target.id) ?? []).length)
    const overTask = tasks.find((t) => t.id === overId)
    if (!overTask) return
    const col = byStatus.get(overTask.statusId) ?? []
    void place(
      String(active.id),
      overTask.statusId,
      col.findIndex((t) => t.id === overId)
    )
  }

  return (
    <>
      <p aria-live="assertive" className="sr-only">
        {announce}
      </p>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragEnd={onDragEnd}
        accessibility={{
          screenReaderInstructions: {
            draggable:
              "Press space to pick up a task. Use the arrow keys to move it, space to drop it, or escape to cancel. Each card also has a Move to menu.",
          },
        }}
      >
        <div className="flex min-h-0 gap-4 overflow-x-auto pb-4">
          {statuses.map((s) => (
            <Column
              key={s.id}
              status={s}
              items={byStatus.get(s.id) ?? []}
              statuses={statuses}
              onMove={place}
              listId={listId}
            />
          ))}
        </div>
      </DndContext>
    </>
  )
}

function Column({
  status,
  items,
  statuses,
  onMove,
  listId,
}: {
  status: Status
  items: TaskRow[]
  statuses: Status[]
  onMove: (id: string, statusId: string, index: number) => void
  listId: string
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status.id })
  return (
    <section
      aria-labelledby={`col-${status.id}`}
      className={cn(
        "flex w-72 shrink-0 flex-col rounded-lg border border-border bg-surface",
        isOver && "border-brand"
      )}
    >
      <h2
        id={`col-${status.id}`}
        className="flex items-center gap-2 px-3 pt-3 pb-2 font-sans text-callout font-semibold"
      >
        <StatusIcon kind={status.kind} />
        {status.name}
        <span className="font-normal text-fg-muted tnum">{items.length}</span>
      </h2>
      <SortableContext items={items.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <ul ref={setNodeRef} className="grid min-h-16 gap-2 px-2 pb-2">
          {items.map((t) => (
            <Card key={t.id} t={t} statuses={statuses} onMove={onMove} />
          ))}
        </ul>
      </SortableContext>
      <div className="mt-auto border-t border-border p-2">
        <QuickAdd listId={listId} statusId={status.id} label={`Add a task to ${status.name}`} />
      </div>
    </section>
  )
}

function Card({
  t,
  statuses,
  onMove,
}: {
  t: TaskRow
  statuses: Status[]
  onMove: (id: string, statusId: string, index: number) => void
}) {
  const open = useOpenTask()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: t.id,
  })
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "rounded-md border border-border bg-background shadow-sm",
        isDragging && "opacity-60 shadow-md"
      )}
    >
      <div className="flex items-start gap-1 p-1">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-roledescription="Draggable task"
          onClick={() => open(t.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter") open(t.id)
            listeners?.onKeyDown?.(e)
          }}
          className="min-h-11 min-w-0 flex-1 cursor-grab rounded-sm px-2 py-1.5 text-left active:cursor-grabbing"
        >
          <span
            className={cn("block text-callout", t.completedAt && "text-fg-secondary line-through")}
          >
            {t.title}
          </span>
          <span className="mt-1 flex items-center justify-between gap-2">
            <TaskMeta t={t} />
            <Avatars people={t.assignees} />
          </span>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon-sm" variant="ghost" aria-label={`Move "${t.title}"`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel className="text-footnote text-fg-muted">Move to</DropdownMenuLabel>
            {statuses
              .filter((s) => s.id !== t.statusId)
              .map((s) => (
                <DropdownMenuItem
                  key={s.id}
                  onSelect={() => onMove(t.id, s.id, Number.MAX_SAFE_INTEGER)}
                >
                  <StatusIcon kind={s.kind} />
                  {s.name}
                </DropdownMenuItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  )
}

// ── Calendar ────────────────────────────────────────────────────────────────

const monthFmt = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
})
const fullFmt = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
})
const iso = (d: Date) => d.toISOString().slice(0, 10)

export function CalendarView({ tasks, month }: { tasks: TaskRow[]; month: string }) {
  const open = useOpenTask()
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()
  const first = new Date(`${month}-01T00:00:00Z`)
  const start = new Date(first)
  start.setUTCDate(1 - ((first.getUTCDay() + 6) % 7)) // Monday on or before the 1st
  const days = Array.from({ length: 42 }, (_, i) => new Date(start.getTime() + i * 86_400_000))
  const today = iso(new Date())
  const go = (delta: number) => {
    const d = new Date(first)
    d.setUTCMonth(d.getUTCMonth() + delta)
    const params = new URLSearchParams(search.toString())
    params.set("month", iso(d).slice(0, 7))
    router.push(`${pathname}?${params.toString()}`, { scroll: false })
  }
  const undated = tasks.filter((t) => !t.dueDate).length
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2">
        <Button size="icon" variant="ghost" aria-label="Previous month" onClick={() => go(-1)}>
          <ChevronLeft />
        </Button>
        <h2 className="min-w-40 font-sans text-headline" aria-live="polite">
          {monthFmt.format(first)}
        </h2>
        <Button size="icon" variant="ghost" aria-label="Next month" onClick={() => go(1)}>
          <ChevronRight />
        </Button>
        {undated > 0 && (
          <p className="ml-auto text-footnote text-fg-secondary">
            {undated} without a due date aren&apos;t shown
          </p>
        )}
      </div>
      {/* A real table: day headers, one row per week, the full date in each cell for screen readers. */}
      <table className="w-full table-fixed border-collapse overflow-hidden rounded-lg border border-border">
        <caption className="sr-only">Tasks due in {monthFmt.format(first)}</caption>
        <thead>
          <tr>
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <th
                key={d}
                scope="col"
                className="border border-border bg-surface px-2 py-1.5 text-center text-footnote font-medium text-fg-secondary"
              >
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 6 }, (_, w) => days.slice(w * 7, w * 7 + 7)).map((week, w) => (
            <tr key={w}>
              {week.map((d) => {
                const key = iso(d)
                const inMonth = d.getUTCMonth() === first.getUTCMonth()
                const items = tasks.filter((t) => t.dueDate === key)
                return (
                  <td
                    key={key}
                    className={cn(
                      "h-24 border border-border p-1.5 align-top",
                      inMonth ? "bg-surface" : "bg-background"
                    )}
                  >
                    <p
                      className={cn(
                        "mb-1 text-footnote tnum",
                        key === today
                          ? "inline-grid size-6 place-items-center rounded-full bg-brand font-semibold text-on-brand"
                          : inMonth
                            ? "text-fg-secondary"
                            : "text-fg-muted"
                      )}
                    >
                      <span aria-hidden>{d.getUTCDate()}</span>
                      <span className="sr-only">
                        {fullFmt.format(d)}
                        {key === today ? ", today" : ""}
                        {items.length ? `, ${items.length} due` : ""}
                      </span>
                    </p>
                    <ul className="grid gap-1">
                      {items.slice(0, 3).map((t) => (
                        <li key={t.id}>
                          <button
                            type="button"
                            onClick={() => open(t.id)}
                            className={cn(
                              "w-full truncate rounded-sm bg-raised px-1.5 py-1 text-left text-caption hover:bg-brand-soft pointer-coarse:min-h-11",
                              t.completedAt && "text-fg-secondary line-through"
                            )}
                          >
                            {t.title}
                          </button>
                        </li>
                      ))}
                      {items.length > 3 && (
                        <li className="px-1.5 text-caption text-fg-muted">
                          +{items.length - 3} more
                        </li>
                      )}
                    </ul>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Timeline ────────────────────────────────────────────────────────────────

export function TimelineView({ tasks, from }: { tasks: TaskRow[]; from: string }) {
  const open = useOpenTask()
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()
  const start = new Date(`${from}T00:00:00Z`)
  const DAYS = 35
  const days = Array.from({ length: DAYS }, (_, i) => new Date(start.getTime() + i * 86_400_000))
  const end = iso(days[DAYS - 1])
  const dated = tasks.filter((t) => t.dueDate || t.startDate)
  const shift = (weeks: number) => {
    const params = new URLSearchParams(search.toString())
    params.set("from", iso(new Date(start.getTime() + weeks * 7 * 86_400_000)))
    router.push(`${pathname}?${params.toString()}`, { scroll: false })
  }
  const dayIndex = (s: string) =>
    Math.round((new Date(`${s}T00:00:00Z`).getTime() - start.getTime()) / 86_400_000)
  const shortFmt = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2">
        <Button size="icon" variant="ghost" aria-label="Earlier" onClick={() => shift(-1)}>
          <ChevronLeft />
        </Button>
        <h2 className="font-sans text-headline" aria-live="polite">
          {shortFmt.format(start)} – {shortFmt.format(days[DAYS - 1])}
        </h2>
        <Button size="icon" variant="ghost" aria-label="Later" onClick={() => shift(1)}>
          <ChevronRight />
        </Button>
        <p className="ml-auto text-footnote text-fg-secondary">
          Tasks need a start or due date to show here.
        </p>
      </div>
      <div
        role="region"
        aria-label="Timeline, scroll sideways for more days"
        tabIndex={0}
        className="overflow-x-auto rounded-lg border border-border bg-surface"
      >
        <div className="min-w-[900px]">
          <div
            className="grid border-b border-border"
            style={{ gridTemplateColumns: `14rem repeat(${DAYS}, minmax(0, 1fr))` }}
          >
            <div className="px-3 py-1.5 text-footnote font-medium text-fg-secondary">Task</div>
            {days.map((d, i) => (
              <div
                key={i}
                className={cn(
                  "py-1.5 text-center text-caption text-fg-muted tnum",
                  d.getUTCDay() === 1 && "border-l border-border"
                )}
              >
                {d.getUTCDay() === 1 ? shortFmt.format(d) : ""}
              </div>
            ))}
          </div>
          <ul>
            {dated.length === 0 && (
              <li className="px-3 py-6 text-callout text-fg-secondary">
                No dated tasks in this list yet.
              </li>
            )}
            {dated.map((t) => {
              const s = t.startDate ?? t.dueDate!
              const e = t.dueDate ?? t.startDate!
              const visible = !(e < from || s > end)
              const a = Math.max(0, dayIndex(s))
              const b = Math.min(DAYS - 1, dayIndex(e))
              return (
                <li
                  key={t.id}
                  className="grid items-center border-b border-border last:border-b-0"
                  style={{ gridTemplateColumns: `14rem repeat(${DAYS}, minmax(0, 1fr))` }}
                >
                  <button
                    type="button"
                    onClick={() => open(t.id)}
                    className="min-h-11 truncate px-3 text-left text-callout hover:underline"
                  >
                    {t.title}
                  </button>
                  {visible && (
                    <div
                      aria-label={`${s} to ${e}`}
                      className={cn(
                        "my-2 h-6 rounded-sm",
                        t.completedAt ? "bg-raised" : "bg-brand-soft"
                      )}
                      style={{ gridColumn: `${a + 2} / ${b + 3}` }}
                    >
                      <span
                        className={cn(
                          "block truncate px-1.5 text-caption leading-6",
                          t.completedAt ? "text-fg-secondary" : "text-brand-ink"
                        )}
                      >
                        {t.title}
                      </span>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </div>
  )
}
