import { cn } from "@/lib/utils"

export function formatElapsed(seconds: number) {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, "0")
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${String(m).padStart(2, "0")}:${ss}`
}

/**
 * The always-visible "You are recording" / "Live" indicator.
 * The dot fades calmly (static under reduced motion). The words are always shown.
 */
export function RecordingPill({
  label = "You are recording",
  elapsedSeconds,
  paused = false,
  children,
  className,
}: {
  label?: string
  elapsedSeconds?: number
  paused?: boolean
  /** Controls such as Pause and Stop. */
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-3 rounded-full border border-border-strong bg-raised py-1.5 pr-1.5 pl-4 shadow-md",
        !children && "pr-4",
        className
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-2 shrink-0 rounded-full",
          paused ? "bg-attention" : "animate-calm-pulse bg-danger"
        )}
      />
      <span className="text-callout font-medium whitespace-nowrap">
        {paused ? "Paused" : label}
      </span>
      {elapsedSeconds !== undefined && (
        <span className="text-callout whitespace-nowrap text-fg-secondary tnum">
          <span className="sr-only">Elapsed time </span>
          {formatElapsed(elapsedSeconds)}
        </span>
      )}
      {children && <span className="flex items-center gap-1">{children}</span>}
    </div>
  )
}
