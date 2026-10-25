import { CalendarDays, Circle, CircleCheck, CircleDashed, CircleDot, Flag } from "lucide-react"
import { initials } from "@/components/app/initials"
import { cn } from "@/lib/utils"

export const priorityMeta = {
  urgent: { label: "Urgent", className: "text-danger-ink" },
  high: { label: "High", className: "text-attention" },
  normal: { label: "Normal", className: "text-fg-secondary" },
  low: { label: "Low", className: "text-fg-muted" },
  none: { label: "No priority", className: "text-fg-muted" },
} as const

export type Priority = keyof typeof priorityMeta

/** Priority is shown with a flag AND a word, so colour is never the only signal. */
export function PriorityTag({ p, compact = false }: { p: Priority; compact?: boolean }) {
  if (p === "none") return null
  const m = priorityMeta[p]
  return (
    <span className={cn("inline-flex items-center gap-1 text-footnote font-medium", m.className)}>
      <Flag aria-hidden className="size-3.5" strokeWidth={1.75} />
      {compact ? <span className="sr-only">{m.label} priority</span> : m.label}
    </span>
  )
}

export function StatusIcon({
  kind,
  className,
}: {
  kind: "todo" | "in_progress" | "done"
  className?: string
}) {
  const Icon = kind === "done" ? CircleCheck : kind === "in_progress" ? CircleDot : Circle
  return (
    <Icon
      aria-hidden
      className={cn(
        "size-4 shrink-0",
        kind === "done"
          ? "text-brand-ink"
          : kind === "in_progress"
            ? "text-attention"
            : "text-fg-muted",
        className
      )}
      strokeWidth={1.75}
    />
  )
}

export function UnknownStatusIcon() {
  return <CircleDashed aria-hidden className="size-4 text-fg-muted" strokeWidth={1.75} />
}

const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
})

/** "Today", "Tomorrow", "Oct 30". Overdue dates say so in words, not just colour. */
export function DueDate({ date, done }: { date: string | null; done?: boolean }) {
  if (!date) return null
  // Reading the clock here is intended: the label only changes at midnight (UTC).
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()
  const today = new Date(now).toISOString().slice(0, 10)
  const tomorrow = new Date(now + 86_400_000).toISOString().slice(0, 10)
  const overdue = !done && date < today
  const label =
    date === today
      ? "Today"
      : date === tomorrow
        ? "Tomorrow"
        : dateFmt.format(new Date(`${date}T00:00:00Z`))
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-footnote tnum",
        overdue ? "font-medium text-danger-ink" : "text-fg-secondary"
      )}
    >
      <CalendarDays aria-hidden className="size-3.5" strokeWidth={1.75} />
      {overdue ? `Overdue · ${label}` : label}
    </span>
  )
}

export function Avatars({
  people,
  max = 3,
}: {
  people: { id: string; name: string }[]
  max?: number
}) {
  if (people.length === 0) return null
  const shown = people.slice(0, max)
  return (
    <span
      className="flex -space-x-1.5"
      aria-label={`Assigned to ${people.map((p) => p.name).join(", ")}`}
    >
      {shown.map((p) => (
        <span
          key={p.id}
          aria-hidden
          className="grid size-6 place-items-center rounded-full border-2 border-surface bg-raised text-[0.625rem] font-semibold text-fg-secondary"
        >
          {initials(p.name)}
        </span>
      ))}
      {people.length > max && (
        <span
          aria-hidden
          className="grid size-6 place-items-center rounded-full border-2 border-surface bg-raised text-[0.625rem] font-semibold tnum"
        >
          +{people.length - max}
        </span>
      )}
    </span>
  )
}

export function LabelChip({ name, tone }: { name: string; tone: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-sm px-1.5 text-caption font-medium",
        tone === "brand" && "bg-brand-soft text-brand-ink",
        tone === "attention" && "bg-attention-soft text-attention",
        tone === "danger" && "bg-danger-soft text-danger-ink",
        tone === "neutral" && "border border-border bg-raised text-fg-secondary"
      )}
    >
      {name}
    </span>
  )
}
