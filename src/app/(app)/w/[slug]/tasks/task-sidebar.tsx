"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useParams, useSelectedLayoutSegment } from "next/navigation"
import { CircleUserRound, Folder, FolderLock, ListTodo, Plus } from "lucide-react"
import { FormMessage } from "@/components/forms/field"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { createListAction, createSpaceAction } from "./actions"

type Tree = {
  id: string
  name: string
  isPrivate: boolean
  lists: { id: string; name: string }[]
}[]
type Person = { id: string; name: string; email: string }

export function TaskSidebar({
  slug,
  tree,
  people,
}: {
  slug: string
  tree: Tree
  people: Person[]
}) {
  const segment = useSelectedLayoutSegment()
  const params = useParams<{ listId?: string }>()
  return (
    <aside
      aria-label="Spaces and lists"
      className={cn(
        "flex w-full flex-col border-border bg-surface max-lg:border-b lg:min-h-0 lg:w-72 lg:border-r",
        segment && "max-lg:hidden"
      )}
    >
      <nav aria-label="Task lists" className="p-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        <ul className="mb-4">
          <li>
            <Link
              href={`/w/${slug}/tasks`}
              aria-current={!segment ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-2.5 rounded-md px-3 text-callout",
                !segment
                  ? "bg-brand-soft text-brand-ink"
                  : "text-fg-secondary hover:bg-raised hover:text-fg"
              )}
            >
              <CircleUserRound aria-hidden className="size-4" strokeWidth={1.75} />
              My tasks
            </Link>
          </li>
        </ul>
        <div className="flex items-center justify-between px-3 py-1">
          <h2 className="font-sans text-footnote font-semibold text-fg-secondary">Spaces</h2>
          <NewSpace slug={slug} people={people} />
        </div>
        {tree.length === 0 && (
          <p className="px-3 py-2 text-footnote text-fg-muted">
            No spaces yet. Make one for a team or project.
          </p>
        )}
        <ul className="grid gap-3">
          {tree.map((s) => {
            const Icon = s.isPrivate ? FolderLock : Folder
            return (
              <li key={s.id}>
                <p className="flex min-h-9 items-center gap-2 px-3 text-callout font-semibold">
                  <Icon aria-hidden className="size-4 text-fg-secondary" strokeWidth={1.75} />
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  {s.isPrivate && <span className="sr-only">(private)</span>}
                </p>
                <ul className="grid gap-0.5">
                  {s.lists.map((l) => (
                    <li key={l.id}>
                      <Link
                        href={`/w/${slug}/tasks/${l.id}`}
                        aria-current={params.listId === l.id ? "page" : undefined}
                        className={cn(
                          "flex min-h-11 items-center gap-2.5 rounded-md pr-3 pl-8 text-callout",
                          params.listId === l.id
                            ? "bg-brand-soft text-brand-ink"
                            : "text-fg-secondary hover:bg-raised hover:text-fg"
                        )}
                      >
                        <ListTodo aria-hidden className="size-4" strokeWidth={1.75} />
                        <span className="truncate">{l.name}</span>
                      </Link>
                    </li>
                  ))}
                  <li>
                    <NewList slug={slug} spaceId={s.id} spaceName={s.name} />
                  </li>
                </ul>
              </li>
            )
          })}
        </ul>
      </nav>
    </aside>
  )
}

function NewSpace({ slug, people }: { slug: string; people: Person[] }) {
  const [name, setName] = useState("")
  const [isPrivate, setIsPrivate] = useState(false)
  const [members, setMembers] = useState<string[]>([])
  const [error, setError] = useState<string>()
  const [pending, start] = useTransition()
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="icon-sm" variant="ghost" aria-label="New space">
          <Plus />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New space</DialogTitle>
          <DialogDescription>A space holds lists of tasks for a team or project.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-5"
          onSubmit={(e) => {
            e.preventDefault()
            start(async () => {
              const r = await createSpaceAction(slug, { name, isPrivate, memberIds: members })
              if (r && !r.ok) setError(r.message)
            })
          }}
        >
          <FormMessage message={error} />
          <div className="grid gap-1.5">
            <Label htmlFor="space-name" className="text-footnote font-medium">
              Name
            </Label>
            <Input
              id="space-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Product"
              maxLength={60}
              required
            />
          </div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <Label htmlFor="space-private" className="text-callout font-medium">
                Private
              </Label>
              <p id="space-private-help" className="mt-1 text-footnote text-fg-secondary">
                {isPrivate
                  ? "Only the people you add can see its lists and tasks."
                  : "Everyone in the workspace can see and work on it."}
              </p>
            </div>
            <Switch
              id="space-private"
              checked={isPrivate}
              onCheckedChange={setIsPrivate}
              aria-describedby="space-private-help"
            />
          </div>
          {isPrivate && (
            <fieldset className="grid gap-1.5">
              <legend className="mb-1.5 text-footnote font-medium">Add people</legend>
              <ul className="max-h-56 overflow-y-auto rounded-md border border-border">
                {people.map((p) => (
                  <li key={p.id}>
                    <Label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 hover:bg-raised">
                      <Checkbox
                        checked={members.includes(p.id)}
                        onCheckedChange={(v) =>
                          setMembers(v ? [...members, p.id] : members.filter((x) => x !== p.id))
                        }
                      />
                      <span className="min-w-0 flex-1 truncate text-callout">{p.name}</span>
                    </Label>
                  </li>
                ))}
              </ul>
            </fieldset>
          )}
          <Button type="submit" loading={pending} disabled={!name.trim()}>
            Create space
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function NewList({
  slug,
  spaceId,
  spaceName,
}: {
  slug: string
  spaceId: string
  spaceName: string
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [error, setError] = useState<string>()
  const [pending, start] = useTransition()
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-11 w-full items-center gap-2.5 rounded-md pr-3 pl-8 text-callout text-fg-muted hover:bg-raised hover:text-fg"
      >
        <Plus aria-hidden className="size-4" strokeWidth={1.75} />
        New list<span className="sr-only"> in {spaceName}</span>
      </button>
    )
  }
  return (
    <form
      className="grid gap-1 py-1 pr-1 pl-8"
      onSubmit={(e) => {
        e.preventDefault()
        start(async () => {
          const r = await createListAction(slug, spaceId, name)
          if (r && !r.ok) setError(r.message)
        })
      }}
    >
      <Label htmlFor={`list-${spaceId}`} className="sr-only">
        New list name in {spaceName}
      </Label>
      <Input
        id={`list-${spaceId}`}
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        placeholder="List name"
        maxLength={80}
        disabled={pending}
      />
      {error && <p className="text-footnote text-danger">{error}</p>}
    </form>
  )
}
