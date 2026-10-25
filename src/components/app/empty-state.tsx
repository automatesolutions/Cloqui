import { cn } from "@/lib/utils"

/** Line art + one sentence on why it's empty + one action. */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  className,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number; "aria-hidden"?: boolean }>
  title: string
  body: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-lg border border-dashed border-border-strong px-6 py-10 text-center",
        className
      )}
    >
      <span className="mb-4 grid size-12 place-items-center rounded-lg bg-raised text-fg-secondary">
        <Icon aria-hidden className="size-6" strokeWidth={1.75} />
      </span>
      <h3 className="text-headline">{title}</h3>
      <p className="mt-1 max-w-[36ch] text-callout text-fg-secondary">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
