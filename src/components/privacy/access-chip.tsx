import { Lock, LockOpen, Users } from "lucide-react"
import { cn } from "@/lib/utils"

export type AccessScope = "private" | "workspace"

/**
 * Shows who can see an item. Required on every video, room, channel and task.
 * "private" = only invited people (teal lock). "workspace" = everyone in the workspace (grey).
 * There is no "public" scope, by design.
 */
export function AccessChip({
  label,
  scope = "private",
  people,
  className,
}: {
  /** "Only you", "You and Maria", "Design team", "Everyone in Acme" */
  label: string
  scope?: AccessScope
  /** When set, shows a people icon instead of a lock. */
  people?: boolean
  className?: string
}) {
  const Icon = scope === "workspace" ? LockOpen : people ? Users : Lock
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-sm px-2 text-caption font-medium whitespace-nowrap",
        scope === "private"
          ? "bg-brand-soft text-brand"
          : "border border-border bg-raised text-fg-secondary",
        className
      )}
    >
      <Icon aria-hidden className="size-4" strokeWidth={1.75} />
      <span>
        <span className="sr-only">Who can see this: </span>
        {label}
      </span>
    </span>
  )
}
