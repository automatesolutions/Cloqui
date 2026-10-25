"use client"

import { useState, useTransition } from "react"
import { Trash2, Zap } from "lucide-react"
import { toast } from "sonner"
import { createAutomationAction, deleteAutomationAction } from "@/app/(app)/w/[slug]/tasks/actions"
import { FormMessage } from "@/components/forms/field"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { AutomationAction, AutomationRow } from "@/server/automations"

const actionLabels: Record<AutomationAction, string> = {
  notify_assignees: "Notify the assignees",
  notify_user: "Notify a person",
  post_channel: "Post a link in a channel",
}

function describe(a: AutomationRow) {
  if (a.action === "notify_assignees") return "notify the assignees"
  if (a.action === "notify_user") return `notify ${a.targetName ?? "someone"}`
  return `post a link in ${a.targetName}`
}

/** "When a task moves to <status>, do <action>." Per list. */
export function AutomationsDialog({
  slug,
  listId,
  automations,
  statuses,
  people,
  channels,
}: {
  slug: string
  listId: string
  automations: AutomationRow[]
  statuses: { id: string; name: string }[]
  people: { id: string; name: string }[]
  channels: { id: string; name: string | null }[]
}) {
  const [statusId, setStatusId] = useState(statuses.at(-1)?.id ?? "")
  const [action, setAction] = useState<AutomationAction>("notify_assignees")
  const [target, setTarget] = useState("")
  const [error, setError] = useState<string>()
  const [pending, start] = useTransition()

  const needsTarget = action !== "notify_assignees"
  const options = action === "notify_user" ? people : channels

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Zap aria-hidden />
          Automations{automations.length ? ` (${automations.length})` : ""}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Automations</DialogTitle>
          <DialogDescription>
            When a task in this list moves to a status, Cloqui does one thing for you. Only people
            who can see this list get notified.
          </DialogDescription>
        </DialogHeader>

        {automations.length > 0 ? (
          <ul className="grid gap-1" aria-label="Automations on this list">
            {automations.map((a) => (
              <li key={a.id} className="flex min-h-11 items-center gap-2 rounded-md bg-raised px-3">
                <span className="min-w-0 flex-1 text-callout">
                  When moved to <strong className="font-semibold">{a.statusName}</strong>,{" "}
                  {describe(a)}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Remove: when moved to ${a.statusName}, ${describe(a)}`}
                  onClick={() =>
                    start(async () => {
                      const r = await deleteAutomationAction(slug, listId, a.id)
                      if (!r.ok) setError(r.message)
                    })
                  }
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-callout text-fg-secondary">No automations on this list yet.</p>
        )}

        <form
          className="grid gap-4 border-t border-border pt-4"
          onSubmit={(e) => {
            e.preventDefault()
            start(async () => {
              const input =
                action === "notify_assignees"
                  ? { statusId, action }
                  : action === "notify_user"
                    ? { statusId, action, targetUserId: target }
                    : { statusId, action, targetChannelId: target }
              const r = await createAutomationAction(slug, listId, input)
              if (!r.ok) return setError(r.message)
              setError(undefined)
              setTarget("")
              toast.success("Automation added.")
            })
          }}
        >
          <FormMessage message={error} />
          <div className="grid gap-1.5">
            <Label htmlFor="auto-status">When a task moves to</Label>
            <Select value={statusId} onValueChange={setStatusId}>
              <SelectTrigger id="auto-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statuses.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="auto-action">Do this</Label>
            <Select
              value={action}
              onValueChange={(v) => {
                setAction(v as AutomationAction)
                setTarget("")
              }}
            >
              <SelectTrigger id="auto-action" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(actionLabels) as AutomationAction[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {actionLabels[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {needsTarget && (
            <div className="grid gap-1.5">
              <Label htmlFor="auto-target">{action === "notify_user" ? "Person" : "Channel"}</Label>
              {options.length ? (
                <Select value={target} onValueChange={setTarget}>
                  <SelectTrigger id="auto-target" className="w-full">
                    <SelectValue
                      placeholder={
                        action === "notify_user" ? "Choose a person" : "Choose a channel"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {action === "post_channel" ? `#${o.name}` : o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-callout text-fg-secondary">
                  {action === "notify_user"
                    ? "Nobody else can see this list yet."
                    : "You aren't in any channels yet."}
                </p>
              )}
              {action === "post_channel" && (
                <p className="text-footnote text-fg-secondary">
                  The post has a link, not the task&apos;s title, so people in the channel who
                  can&apos;t see this list learn nothing about it.
                </p>
              )}
            </div>
          )}
          <Button
            type="submit"
            className="justify-self-start"
            loading={pending}
            disabled={!statusId || (needsTarget && !target)}
          >
            Add automation
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
