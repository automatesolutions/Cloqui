import { Globe, Lock, LockOpen, Users } from "lucide-react"
import { cn } from "@/lib/utils"

export type AccessScope = "private" | "workspace" | "public"

/**
 * Shows who can see an item. Required on every video, room, channel and task.
 * "private" = only invited people (teal lock). "workspace" = everyone in the workspace (grey).
 * "public" = a video's opt-in public link (amber globe): it needs watching.
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
  const Icon = scope === "public" ? Globe : scope === "workspace" ? LockOpen : people ? Users : Lock
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-sm px-2 text-caption font-medium whitespace-nowrap",
        scope === "private"
          ? "bg-brand-soft text-brand-ink"
          : scope === "public"
            ? "bg-attention-soft text-attention"
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
