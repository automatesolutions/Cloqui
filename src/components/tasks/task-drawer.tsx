"use client"

import { useCallback, useEffect, useState, useTransition } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  Archive,
  Check,
  Download,
  Hash,
  Lock,
  MessageSquare,
  Paperclip,
  Plus,
  Tag,
  Trash2,
  Users,
  Video,
  X,
} from "lucide-react"
import { toast } from "sonner"
import {
  archiveTaskAction,
  attachmentConfirmAction,
  attachmentUploadAction,
  attachmentUrlAction,
  checklistAddAction,
  checklistRemoveAction,
  checklistToggleAction,
  commentAction,
  createLabelAction,
  deleteCommentAction,
  quickAddAction,
  setAssigneesAction,
  setLabelsAction,
  taskDetailAction,
  updateTaskAction,
} from "@/app/(app)/w/[slug]/tasks/actions"
import { initials } from "@/components/app/initials"
import { AccessChip } from "@/components/privacy/access-chip"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { relativeDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Avatars, LabelChip, priorityMeta, StatusIcon, type Priority } from "./bits"
import { RichText } from "./rich-text"

type Detail = NonNullable<Awaited<ReturnType<typeof taskDetailAction>>>

/** Opens when the URL has ?task=<id>. Works on every task screen. */
export function TaskDrawer({ slug }: { slug: string }) {
  const search = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const taskId = search.get("task")
  const [detail, setDetail] = useState<Detail | null>(null)
  const [missing, setMissing] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!taskId) return
    let alive = true
    taskDetailAction(taskId)
      .then((d) => {
        if (!alive) return
        setDetail(d)
        setMissing(!d)
      })
      .catch(() => alive && setMissing(true))
    return () => {
      alive = false
    }
  }, [taskId, tick])

  const refresh = useCallback(() => {
    setTick((t) => t + 1)
    router.refresh()
  }, [router])

  const close = () => {
    const params = new URLSearchParams(search.toString())
    params.delete("task")
    const q = params.toString()
    router.push(q ? `${pathname}?${q}` : pathname, { scroll: false })
    setDetail(null)
    setMissing(false)
  }

  return (
    <Sheet open={!!taskId} onOpenChange={(o) => !o && close()}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-[600px]">
        {missing ? (
          <div className="p-6">
            <SheetHeader className="p-0">
              <SheetTitle>You don&apos;t have access to this task</SheetTitle>
              <SheetDescription>It may be in a private space, or it was archived.</SheetDescription>
            </SheetHeader>
          </div>
        ) : !detail || detail.task.id !== taskId ? (
          <div className="p-6" role="status">
            <SheetHeader className="p-0">
              <SheetTitle>Loading task…</SheetTitle>
              <SheetDescription className="sr-only">Loading</SheetDescription>
            </SheetHeader>
          </div>
        ) : (
          <TaskEditor
            key={detail.task.id}
            d={detail}
            slug={slug}
            onChange={refresh}
            onClose={close}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}

function useAct(onChange: () => void) {
  const [pending, start] = useTransition()
  const act = (fn: () => Promise<{ ok: boolean; message?: string }>, success?: string) =>
    start(async () => {
      const r = await fn()
      if (!r.ok) toast.error(r.message ?? "That didn't work.")
      else {
        if (success) toast.success(success)
        onChange()
      }
    })
  return { pending, act }
}

function TaskEditor({
  d,
  slug,
  onChange,
  onClose,
}: {
  d: Detail
  slug: string
  onChange: () => void
  onClose: () => void
}) {
  const { act, pending } = useAct(onChange)
  const t = d.task
  const [title, setTitle] = useState(t.title)
  const status = d.list.statuses.find((s) => s.id === t.statusId)
  const doneStatus = d.list.statuses.find((s) => s.kind === "done")
  const people = d.list.people
  const assigned = people.filter((p) => d.assignees.some((a) => a.id === p.id))

  return (
    <div className="grid gap-6 pb-10">
      <SheetHeader className="border-b border-border p-5 pr-14">
        <SheetDescription className="flex flex-wrap items-center gap-2">
          <span className="text-footnote text-fg-secondary">
            {d.list.space.name} › {d.list.list.name}
          </span>
          <AccessChip
            label={d.list.space.isPrivate ? "Space members only" : "Everyone in the workspace"}
            scope={d.list.space.isPrivate ? "private" : "workspace"}
          />
        </SheetDescription>
        <SheetTitle className="sr-only">{t.title}</SheetTitle>
        <div className="flex items-start gap-2">
          {doneStatus && (
            <Button
              size="icon"
              variant="ghost"
              aria-label={t.completedAt ? "Mark as not done" : "Mark as done"}
              aria-pressed={!!t.completedAt}
              onClick={() =>
                act(() =>
                  updateTaskAction(t.id, {
                    statusId: t.completedAt ? d.list.statuses[0].id : doneStatus.id,
                  })
                )
              }
            >
              {t.completedAt ? (
                <StatusIcon kind="done" className="size-6" />
              ) : (
                <StatusIcon kind="todo" className="size-6" />
              )}
            </Button>
          )}
          <Label htmlFor="task-title" className="sr-only">
            Title
          </Label>
          <Textarea
            id="task-title"
            value={title}
            maxLength={300}
            rows={1}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() =>
              title.trim() && title !== t.title && act(() => updateTaskAction(t.id, { title }))
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                e.currentTarget.blur()
              }
            }}
            className={cn(
              "min-h-11 flex-1 resize-none border-transparent bg-transparent font-heading text-title-3 font-medium",
              t.completedAt && "text-fg-secondary line-through"
            )}
          />
        </div>
      </SheetHeader>

      <div className="grid gap-4 px-5 sm:grid-cols-2">
        <Field label="Status">
          <Select
            value={t.statusId}
            onValueChange={(v) => act(() => updateTaskAction(t.id, { statusId: v }))}
          >
            <SelectTrigger aria-label={`Status: ${status?.name}`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {d.list.statuses.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  <StatusIcon kind={s.kind} />
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Priority">
          <Select
            value={t.priority}
            onValueChange={(v) => act(() => updateTaskAction(t.id, { priority: v }))}
          >
            <SelectTrigger
              aria-label={`Priority: ${priorityMeta[t.priority as Priority].label}`}
              className="w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(priorityMeta) as Priority[]).map((p) => (
                <SelectItem key={p} value={p}>
                  {priorityMeta[p].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Assignees">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="secondary"
                className="w-full justify-start"
                aria-label={`Assignees: ${assigned.map((a) => a.name).join(", ") || "nobody"}`}
              >
                <Users aria-hidden />
                {assigned.length ? (
                  <Avatars people={assigned} />
                ) : (
                  <span className="text-fg-secondary">Nobody yet</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 p-1">
              <p className="px-2 py-1.5 text-footnote text-fg-secondary">
                Only people who can see this space
              </p>
              <ul className="max-h-64 overflow-y-auto">
                {people.map((p) => {
                  const on = d.assignees.some((a) => a.id === p.id)
                  return (
                    <li key={p.id}>
                      <Label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-sm px-2 hover:bg-raised">
                        <Checkbox
                          checked={on}
                          disabled={pending}
                          onCheckedChange={(v) =>
                            act(() =>
                              setAssigneesAction(
                                t.id,
                                v
                                  ? [...d.assignees.map((a) => a.id), p.id]
                                  : d.assignees.map((a) => a.id).filter((x) => x !== p.id)
                              )
                            )
                          }
                        />
                        <span className="truncate text-callout">{p.name}</span>
                      </Label>
                    </li>
                  )
                })}
              </ul>
            </PopoverContent>
          </Popover>
        </Field>
        <Field label="Labels">
          <LabelPicker d={d} act={act} pending={pending} />
        </Field>
        <Field label="Start date" htmlFor="start-date">
          <Input
            id="start-date"
            type="date"
            value={t.startDate ?? ""}
            max={t.dueDate ?? undefined}
            onChange={(e) =>
              act(() => updateTaskAction(t.id, { startDate: e.target.value || null }))
            }
          />
        </Field>
        <Field label="Due date" htmlFor="due-date">
          <Input
            id="due-date"
            type="date"
            value={t.dueDate ?? ""}
            min={t.startDate ?? undefined}
            onChange={(e) => act(() => updateTaskAction(t.id, { dueDate: e.target.value || null }))}
          />
        </Field>
        <Field label="Estimate (hours)" htmlFor="estimate">
          <Input
            id="estimate"
            type="number"
            min={0}
            step={0.25}
            inputMode="decimal"
            defaultValue={t.estimateMinutes ? t.estimateMinutes / 60 : ""}
            onBlur={(e) => {
              const h = Number(e.target.value)
              const minutes = e.target.value === "" ? null : Math.round(h * 60)
              if (minutes !== t.estimateMinutes && (minutes === null || minutes > 0))
                act(() => updateTaskAction(t.id, { estimateMinutes: minutes }))
            }}
          />
        </Field>
      </div>

      {(d.video || d.source || d.channel || d.list.channel) && (
        <section aria-label="Linked items" className="flex flex-wrap gap-2 px-5">
          {d.video && (
            <Link
              href={`/v/${d.video.id}`}
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-surface px-3 text-callout hover:bg-raised"
            >
              <Video aria-hidden className="size-4" strokeWidth={1.75} />
              {d.video.title}
            </Link>
          )}
          {d.source && (
            <Link
              href={`/w/${slug}/chat/${d.source.channelId}?thread=${d.source.parentId ?? d.source.messageId}`}
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-surface px-3 text-callout hover:bg-raised"
            >
              <MessageSquare aria-hidden className="size-4" strokeWidth={1.75} />
              Original message
            </Link>
          )}
          {(d.channel ?? d.list.channel) && (
            <Link
              href={`/w/${slug}/chat/${(d.channel ?? d.list.channel)!.id}`}
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-surface px-3 text-callout hover:bg-raised"
            >
              <Hash aria-hidden className="size-4" strokeWidth={1.75} />
              Discuss in {d.channel ? d.channel.name : `#${d.list.channel!.name}`}
            </Link>
          )}
        </section>
      )}

      <section aria-labelledby="desc-h" className="grid gap-2 px-5">
        <h3 id="desc-h" className="font-sans text-headline">
          Description
        </h3>
        <RichText
          label="Task description"
          value={t.description as Record<string, unknown> | null}
          onSave={(doc) =>
            JSON.stringify(doc) !== JSON.stringify(t.description) &&
            act(() => updateTaskAction(t.id, { description: doc }))
          }
        />
      </section>

      <Checklist d={d} act={act} />
      <Subtasks d={d} act={act} slug={slug} />
      <Attachments d={d} onChange={onChange} />
      <Comments d={d} act={act} />

      <section aria-labelledby="act-h" className="grid gap-2 px-5">
        <h3 id="act-h" className="font-sans text-headline">
          Activity
        </h3>
        <ol className="grid gap-1.5">
          {d.activity.map((a) => (
            <li key={a.id} className="text-footnote text-fg-secondary">
              <span className="font-medium text-fg">{a.actorName}</span>{" "}
              {describe(a.action, a.metadata as Record<string, unknown>)} ·{" "}
              <time dateTime={new Date(a.createdAt).toISOString()}>
                {relativeDate(new Date(a.createdAt))}
              </time>
            </li>
          ))}
        </ol>
      </section>

      <div className="flex justify-between gap-2 border-t border-border px-5 pt-5">
        <p className="text-footnote text-fg-muted">
          Created by {d.createdByName} · {relativeDate(new Date(t.createdAt))}
        </p>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm">
              <Archive aria-hidden />
              Archive
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Archive this task?</AlertDialogTitle>
              <AlertDialogDescription>
                It disappears from lists and boards. Its history is kept.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel asChild>
                <Button variant="secondary">Keep it</Button>
              </AlertDialogCancel>
              <AlertDialogAction asChild>
                <Button
                  variant="danger"
                  onClick={async () => {
                    const r = await archiveTaskAction(t.id)
                    if (!r.ok) return void toast.error(r.message)
                    onClose()
                    onChange()
                  }}
                >
                  Archive
                </Button>
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}

const actDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
})
const fmtDay = (v: unknown) =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)
    ? actDate.format(new Date(`${v}T00:00:00Z`))
    : String(v)

function describe(action: string, m: Record<string, unknown>) {
  switch (action) {
    case "created":
      return m.subtaskOf ? "created this subtask" : "created this task"
    case "status":
      return `moved it to ${m.to}`
    case "title":
      return "renamed it"
    case "priority":
      return `set priority to ${priorityMeta[(m.to as Priority) ?? "none"]?.label ?? m.to}`
    case "dueDate":
      return m.to ? `set the due date to ${fmtDay(m.to)}` : "removed the due date"
    case "startDate":
      return m.to ? `set the start date to ${fmtDay(m.to)}` : "removed the start date"
    case "estimateMinutes":
      return "changed the estimate"
    case "edited_description":
      return "edited the description"
    case "assignees":
      return "changed who's assigned"
    case "labels":
      return "changed labels"
    case "attachment":
      return "attached a file"
    case "archived":
      return "archived it"
    default:
      return action
  }
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor?: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-1.5">
      {htmlFor ? (
        <Label htmlFor={htmlFor} className="text-footnote font-medium text-fg-secondary">
          {label}
        </Label>
      ) : (
        <span className="text-footnote font-medium text-fg-secondary">{label}</span>
      )}
      {children}
    </div>
  )
}

type Act = (fn: () => Promise<{ ok: boolean; message?: string }>, success?: string) => void

function LabelPicker({ d, act, pending }: { d: Detail; act: Act; pending: boolean }) {
  const [name, setName] = useState("")
  const selected = d.list.labels.filter((l) => d.labelIds.some((x) => x.id === l.id))
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="secondary"
          className="h-auto min-h-11 w-full flex-wrap justify-start py-2"
          aria-label={`Labels: ${selected.map((l) => l.name).join(", ") || "none"}`}
        >
          <Tag aria-hidden />
          {selected.length ? (
            selected.map((l) => <LabelChip key={l.id} name={l.name} tone={l.tone} />)
          ) : (
            <span className="text-fg-secondary">No labels</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-1">
        <ul className="max-h-56 overflow-y-auto">
          {d.list.labels.length === 0 && (
            <li className="px-2 py-2 text-footnote text-fg-muted">No labels in this space yet.</li>
          )}
          {d.list.labels.map((l) => {
            const on = d.labelIds.some((x) => x.id === l.id)
            return (
              <li key={l.id}>
                <Label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-sm px-2 hover:bg-raised">
                  <Checkbox
                    checked={on}
                    disabled={pending}
                    onCheckedChange={(v) =>
                      act(() =>
                        setLabelsAction(
                          d.task.id,
                          v
                            ? [...d.labelIds.map((x) => x.id), l.id]
                            : d.labelIds.map((x) => x.id).filter((x) => x !== l.id)
                        )
                      )
                    }
                  />
                  <LabelChip name={l.name} tone={l.tone} />
                </Label>
              </li>
            )
          })}
        </ul>
        <form
          className="flex gap-1 border-t border-border p-1 pt-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!name.trim()) return
            act(async () => {
              const r = await createLabelAction(d.list.space.id, name, "neutral")
              if (r.ok) {
                setName("")
                return setLabelsAction(d.task.id, [...d.labelIds.map((x) => x.id), r.id])
              }
              return r
            })
          }}
        >
          <Label htmlFor="new-label" className="sr-only">
            New label
          </Label>
          <Input
            id="new-label"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New label"
            maxLength={30}
          />
          <Button type="submit" size="icon" variant="ghost" aria-label="Add label">
            <Plus />
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}

function Checklist({ d, act }: { d: Detail; act: Act }) {
  const [body, setBody] = useState("")
  const done = d.checklist.filter((c) => c.done).length
  return (
    <section aria-labelledby="check-h" className="grid gap-2 px-5">
      <h3 id="check-h" className="flex items-baseline gap-2 font-sans text-headline">
        Checklist
        {d.checklist.length > 0 && (
          <span className="text-footnote font-normal text-fg-secondary tnum">
            {done} of {d.checklist.length}
          </span>
        )}
      </h3>
      <ul className="grid gap-0.5">
        {d.checklist.map((c) => (
          <li key={c.id} className="group flex items-center gap-1">
            <Label className="flex min-h-11 flex-1 cursor-pointer items-center gap-3 rounded-sm px-1 hover:bg-raised">
              <Checkbox
                checked={c.done}
                onCheckedChange={(v) => act(() => checklistToggleAction(c.id, v === true))}
              />
              <span className={cn("text-callout", c.done && "text-fg-secondary line-through")}>
                {c.body}
              </span>
            </Label>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`Remove "${c.body}"`}
              onClick={() => act(() => checklistRemoveAction(c.id))}
              className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100"
            >
              <X />
            </Button>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!body.trim()) return
          act(async () => {
            const r = await checklistAddAction(d.task.id, body)
            if (r.ok) setBody("")
            return r
          })
        }}
      >
        <Label htmlFor="check-add" className="sr-only">
          Add a checklist item
        </Label>
        <Input
          id="check-add"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add an item"
          maxLength={300}
        />
        <Button type="submit" variant="secondary" disabled={!body.trim()}>
          Add
        </Button>
      </form>
    </section>
  )
}

function Subtasks({ d, act, slug }: { d: Detail; act: Act; slug: string }) {
  const [title, setTitle] = useState("")
  const router = useRouter()
  const pathname = usePathname()
  const done = d.list.statuses.find((s) => s.kind === "done")
  return (
    <section aria-labelledby="sub-h" className="grid gap-2 px-5">
      <h3 id="sub-h" className="font-sans text-headline">
        Subtasks
      </h3>
      <ul className="grid gap-0.5">
        {d.subtasks.map((s) => (
          <li key={s.id} className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              aria-label={
                s.completedAt ? `Mark "${s.title}" as not done` : `Mark "${s.title}" as done`
              }
              aria-pressed={!!s.completedAt}
              onClick={() =>
                act(() =>
                  updateTaskAction(s.id, {
                    statusId: s.completedAt ? d.list.statuses[0].id : done!.id,
                  })
                )
              }
            >
              {s.completedAt ? <Check className="text-brand-ink" /> : <StatusIcon kind="todo" />}
            </Button>
            <button
              type="button"
              onClick={() => router.push(`${pathname}?task=${s.id}`, { scroll: false })}
              className={cn(
                "min-h-11 flex-1 truncate rounded-sm px-1 text-left text-callout hover:bg-raised",
                s.completedAt && "text-fg-secondary line-through"
              )}
            >
              {s.title}
            </button>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!title.trim()) return
          act(async () => {
            const r = await quickAddAction(d.task.listId, title, undefined, d.task.id)
            if (r.ok) setTitle("")
            return r
          })
        }}
      >
        <Label htmlFor="sub-add" className="sr-only">
          Add a subtask
        </Label>
        <Input
          id="sub-add"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a subtask"
          maxLength={300}
        />
        <Button type="submit" variant="secondary" disabled={!title.trim()}>
          Add
        </Button>
      </form>
      <span className="sr-only">{slug}</span>
    </section>
  )
}

function Attachments({ d, onChange }: { d: Detail; onChange: () => void }) {
  const [busy, setBusy] = useState(false)
  return (
    <section aria-labelledby="att-h" className="grid gap-2 px-5">
      <h3 id="att-h" className="font-sans text-headline">
        Files
      </h3>
      <ul className="grid gap-1.5">
        {d.attachments.map((a) => (
          <li
            key={a.id}
            className="flex items-center gap-3 rounded-md border border-border bg-surface px-3 py-1.5"
          >
            <Paperclip aria-hidden className="size-4 text-fg-secondary" strokeWidth={1.75} />
            <span className="min-w-0 flex-1 truncate text-callout">{a.name}</span>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`Download ${a.name}`}
              onClick={async () => {
                const r = await attachmentUrlAction(a.id)
                if (r.ok) window.location.assign(r.url)
                else toast.error(r.message)
              }}
            >
              <Download />
            </Button>
          </li>
        ))}
      </ul>
      <label
        className={cn(
          "inline-flex min-h-11 w-fit cursor-pointer items-center gap-2 rounded-md border border-border-strong px-4 text-callout font-medium focus-within:outline-2 focus-within:outline-brand hover:bg-raised",
          busy && "opacity-45"
        )}
      >
        <Paperclip aria-hidden className="size-4" strokeWidth={1.75} />
        {busy ? "Uploading…" : "Attach a file"}
        <input
          type="file"
          className="sr-only"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ""
            if (!file) return
            setBusy(true)
            try {
              const up = await attachmentUploadAction(d.task.id, {
                name: file.name,
                mimeType: file.type || "application/octet-stream",
                sizeBytes: file.size,
              })
              if (!up.ok) return void toast.error(up.message)
              const res = await fetch(up.uploadUrl, {
                method: "PUT",
                headers: { "Content-Type": up.contentType },
                body: file,
              })
              if (!res.ok) return void toast.error("The upload didn't finish. Try again.")
              const c = await attachmentConfirmAction(up.attachmentId)
              if (!c.ok) return void toast.error(c.message)
              onChange()
            } finally {
              setBusy(false)
            }
          }}
        />
      </label>
      <p className="flex items-center gap-1.5 text-footnote text-fg-muted">
        <Lock aria-hidden className="size-3.5" strokeWidth={1.75} />
        Files are private. Only people who can see this task can download them.
      </p>
    </section>
  )
}

function Comments({ d, act }: { d: Detail; act: Act }) {
  const [body, setBody] = useState("")
  const [mentions, setMentions] = useState<string[]>([])
  return (
    <section aria-labelledby="com-h" className="grid gap-3 px-5">
      <h3 id="com-h" className="font-sans text-headline">
        Comments
      </h3>
      <ol className="grid gap-3">
        {d.comments.map((c) => (
          <li key={c.id} className="flex gap-3">
            <span
              aria-hidden
              className="grid size-8 shrink-0 place-items-center rounded-full border border-border bg-raised text-caption font-semibold text-fg-secondary"
            >
              {initials(c.authorName)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-callout">
                <span className="font-semibold">{c.authorName}</span>{" "}
                <span className="text-footnote text-fg-muted">
                  {relativeDate(new Date(c.createdAt))}
                </span>
              </p>
              <p className="text-callout break-words whitespace-pre-wrap">{c.body}</p>
            </div>
            {c.authorId === d.viewerId && (
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Delete your comment"
                onClick={() => act(() => deleteCommentAction(c.id))}
              >
                <Trash2 />
              </Button>
            )}
          </li>
        ))}
      </ol>
      <form
        className="grid gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!body.trim()) return
          act(async () => {
            const r = await commentAction(d.task.id, body, mentions)
            if (r.ok) {
              setBody("")
              setMentions([])
            }
            return r
          })
        }}
      >
        <Label htmlFor="task-comment" className="sr-only">
          Write a comment
        </Label>
        <Textarea
          id="task-comment"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write a comment"
          maxLength={4000}
          className="min-h-20"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Select
            value=""
            onValueChange={(id) => {
              const p = d.list.people.find((x) => x.id === id)
              if (!p) return
              setBody((b) => `${b}${b && !b.endsWith(" ") ? " " : ""}@${p.name} `)
              setMentions((m) => [...new Set([...m, p.id])])
            }}
          >
            <SelectTrigger aria-label="Mention someone" className="w-56">
              <SelectValue placeholder="@ Mention someone" />
            </SelectTrigger>
            <SelectContent>
              {d.list.people.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="submit" disabled={!body.trim()}>
            Comment
          </Button>
        </div>
      </form>
    </section>
  )
}
