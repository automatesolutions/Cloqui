"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ListTodo } from "lucide-react"
import {
  listTargetsAction,
  taskFromMessageAction,
  taskFromVideoAction,
} from "@/app/(app)/w/[slug]/tasks/actions"
import { FormMessage } from "@/components/forms/field"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

/** Pick a list, then turn a chat message or a video into a task there. */
export function MakeTaskDialog({
  open,
  onOpenChange,
  slug,
  source,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  slug: string
  source: { kind: "message"; id: string } | { kind: "video"; id: string }
}) {
  const [targets, setTargets] = useState<{ id: string; name: string; spaceName: string }[] | null>(
    null
  )
  const [picked, setPicked] = useState<string>()
  const [error, setError] = useState<string>()
  const [pending, start] = useTransition()
  const router = useRouter()

  useEffect(() => {
    if (!open) return
    let alive = true
    listTargetsAction(slug)
      .then((t) => {
        if (!alive) return
        setTargets(t)
        setPicked((p) => p ?? t[0]?.id)
      })
      .catch(() => alive && setError("We couldn't load your lists."))
    return () => {
      alive = false
    }
  }, [open, slug])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Make a task</DialogTitle>
          <DialogDescription>
            {source.kind === "message"
              ? "The task links back to this message."
              : "The task links to this video. Only people who can watch it see the link."}
          </DialogDescription>
        </DialogHeader>
        <FormMessage message={error} />
        {targets === null ? (
          <p role="status" className="text-callout text-fg-secondary">
            Loading your lists…
          </p>
        ) : targets.length === 0 ? (
          <p className="text-callout text-fg-secondary">
            You don&apos;t have any task lists yet. Create a space in Tasks first.
          </p>
        ) : (
          <ul role="radiogroup" aria-label="List" className="grid max-h-72 gap-1 overflow-y-auto">
            {targets.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={picked === t.id}
                  onClick={() => setPicked(t.id)}
                  className={cn(
                    "flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-callout",
                    picked === t.id ? "bg-brand-soft text-brand-ink" : "hover:bg-raised"
                  )}
                >
                  <ListTodo aria-hidden className="size-4 shrink-0" strokeWidth={1.75} />
                  <span className="min-w-0 flex-1 truncate">{t.name}</span>
                  <span className="truncate text-footnote text-fg-secondary">{t.spaceName}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <Button
          loading={pending}
          disabled={!picked}
          onClick={() =>
            start(async () => {
              if (!picked) return
              const r =
                source.kind === "message"
                  ? await taskFromMessageAction(slug, source.id, picked)
                  : await taskFromVideoAction(slug, source.id, picked)
              if (!r.ok) return setError(r.message)
              onOpenChange(false)
              router.push(r.url)
            })
          }
        >
          Create task
        </Button>
      </DialogContent>
    </Dialog>
  )
}
