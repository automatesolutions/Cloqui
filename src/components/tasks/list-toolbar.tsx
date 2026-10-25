"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Bookmark, CalendarDays, Columns3, GanttChart, List, X } from "lucide-react"
import { toast } from "sonner"
import { deleteViewAction, saveViewAction } from "@/app/(app)/w/[slug]/tasks/actions"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { priorityMeta, type Priority } from "./bits"

const views = [
  { value: "list", label: "List", icon: List },
  { value: "board", label: "Board", icon: Columns3 },
  { value: "calendar", label: "Calendar", icon: CalendarDays },
  { value: "timeline", label: "Timeline", icon: GanttChart },
] as const

type Saved = { id: string; name: string; view: string; filters: Record<string, unknown> }

export function ListToolbar({
  listId,
  people,
  labels,
  saved,
}: {
  listId: string
  people: { id: string; name: string }[]
  labels: { id: string; name: string }[]
  saved: Saved[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()
  const view = search.get("view") ?? "list"
  const [q, setQ] = useState(search.get("q") ?? "")
  const [pending, start] = useTransition()
  const [saveOpen, setSaveOpen] = useState(false)
  const [viewName, setViewName] = useState("")

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(search.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    params.delete("task")
    router.push(`${pathname}?${params.toString()}`, { scroll: false })
  }

  const filters = {
    assignee: search.get("assignee") ?? undefined,
    priority: search.get("priority")?.split(",").filter(Boolean),
    labelId: search.get("label") ?? undefined,
    status: search.get("status") ?? undefined,
    q: search.get("q") ?? undefined,
  }
  const active = Object.values(filters).some((v) => (Array.isArray(v) ? v.length : v))

  function hrefFor(v: Saved) {
    const p = new URLSearchParams({ view: v.view })
    const f = v.filters as {
      assignee?: string
      priority?: string[]
      labelId?: string
      status?: string
      q?: string
    }
    if (f.assignee) p.set("assignee", f.assignee)
    if (f.priority?.length) p.set("priority", f.priority.join(","))
    if (f.labelId) p.set("label", f.labelId)
    if (f.status) p.set("status", f.status)
    if (f.q) p.set("q", f.q)
    return `${pathname}?${p.toString()}`
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <nav
          aria-label="Views"
          className="flex gap-1 rounded-md border border-border bg-surface p-1"
        >
          {views.map((v) => (
            <button
              key={v.value}
              type="button"
              aria-current={view === v.value ? "page" : undefined}
              onClick={() => setParam("view", v.value === "list" ? null : v.value)}
              className={cn(
                "relative inline-flex h-9 items-center gap-1.5 rounded-sm px-3 text-footnote font-medium after:absolute after:-inset-1 after:content-[''] pointer-coarse:h-11",
                view === v.value ? "bg-raised text-fg shadow-sm" : "text-fg-secondary hover:text-fg"
              )}
            >
              <v.icon aria-hidden className="size-4" strokeWidth={1.75} />
              <span className="max-sm:sr-only">{v.label}</span>
            </button>
          ))}
        </nav>
        <form
          role="search"
          className="min-w-40 flex-1"
          onSubmit={(e) => {
            e.preventDefault()
            setParam("q", q.trim() || null)
          }}
        >
          <Label htmlFor="task-q" className="sr-only">
            Find tasks
          </Label>
          <Input
            id="task-q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find tasks"
          />
        </form>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" aria-label="Saved views">
              <Bookmark aria-hidden />
              <span className="max-sm:sr-only">Saved views</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="text-footnote text-fg-muted">
              Only you see your saved views
            </DropdownMenuLabel>
            {saved.length === 0 && (
              <p className="px-2.5 py-2 text-footnote text-fg-secondary">
                None yet. Set filters, then save them.
              </p>
            )}
            {saved.map((v) => (
              <DropdownMenuItem key={v.id} asChild>
                <Link href={hrefFor(v)} className="justify-between">
                  <span className="truncate">{v.name}</span>
                  <button
                    type="button"
                    aria-label={`Delete view ${v.name}`}
                    className="grid size-7 place-items-center rounded-sm hover:bg-background"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      start(async () => {
                        const r = await deleteViewAction(v.id)
                        if (!r.ok) toast.error(r.message)
                        router.refresh()
                      })
                    }}
                  >
                    <X aria-hidden className="size-3.5" />
                  </button>
                </Link>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={pending} onSelect={() => setSaveOpen(true)}>
              <Bookmark aria-hidden className="size-4" />
              Save current view
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Save this view</DialogTitle>
              <DialogDescription>
                Keeps the current view and filters. Only you will see it.
              </DialogDescription>
            </DialogHeader>
            <form
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault()
                if (!viewName.trim()) return
                start(async () => {
                  const clean = Object.fromEntries(
                    Object.entries(filters).filter(([, v]) => (Array.isArray(v) ? v.length : v))
                  )
                  const r = await saveViewAction(listId, viewName, view, clean)
                  if (!r.ok) return void toast.error(r.message)
                  toast.success("View saved.")
                  setSaveOpen(false)
                  setViewName("")
                  router.refresh()
                })
              }}
            >
              <div className="grid gap-1.5">
                <Label htmlFor="view-name" className="text-footnote font-medium">
                  Name
                </Label>
                <Input
                  id="view-name"
                  value={viewName}
                  onChange={(e) => setViewName(e.target.value)}
                  placeholder="My urgent tasks"
                  maxLength={60}
                  autoFocus
                />
              </div>
              <Button type="submit" loading={pending} disabled={!viewName.trim()}>
                Save view
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filters">
        <Select
          value={filters.assignee ?? "any"}
          onValueChange={(v) => setParam("assignee", v === "any" ? null : v)}
        >
          <SelectTrigger size="sm" aria-label="Assignee filter" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Anyone</SelectItem>
            <SelectItem value="me">Assigned to me</SelectItem>
            {people.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.priority?.[0] ?? "any"}
          onValueChange={(v) => setParam("priority", v === "any" ? null : v)}
        >
          <SelectTrigger size="sm" aria-label="Priority filter" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any priority</SelectItem>
            {(Object.keys(priorityMeta) as Priority[])
              .filter((p) => p !== "none")
              .map((p) => (
                <SelectItem key={p} value={p}>
                  {priorityMeta[p].label}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.status ?? "any"}
          onValueChange={(v) => setParam("status", v === "any" ? null : v)}
        >
          <SelectTrigger size="sm" aria-label="Status filter" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any status</SelectItem>
            <SelectItem value="todo">Not started</SelectItem>
            <SelectItem value="in_progress">In progress</SelectItem>
            <SelectItem value="done">Done</SelectItem>
          </SelectContent>
        </Select>
        {labels.length > 0 && (
          <Select
            value={filters.labelId ?? "any"}
            onValueChange={(v) => setParam("label", v === "any" ? null : v)}
          >
            <SelectTrigger size="sm" aria-label="Label filter" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any label</SelectItem>
              {labels.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {active && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setQ("")
              router.push(view === "list" ? pathname : `${pathname}?view=${view}`, {
                scroll: false,
              })
            }}
          >
            Clear filters
          </Button>
        )}
      </div>
    </div>
  )
}
