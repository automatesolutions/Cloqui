import { AlertCircle } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

/** Label above, helper below, error below with an icon (colour is never the only signal). */
export function Field({
  name,
  label,
  error,
  help,
  className,
  ...props
}: React.ComponentProps<typeof Input> & {
  name: string
  label: string
  error?: string
  help?: React.ReactNode
}) {
  const id = props.id ?? `f-${name}`
  const helpId = help ? `${id}-help` : undefined
  const errId = error ? `${id}-err` : undefined
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={id} className="text-footnote font-medium">
        {label}
      </Label>
      <Input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={[errId, helpId].filter(Boolean).join(" ") || undefined}
        {...props}
      />
      {error && (
        <p id={errId} className="flex items-center gap-1.5 text-footnote text-danger">
          <AlertCircle aria-hidden className="size-4 shrink-0" strokeWidth={1.75} />
          {error}
        </p>
      )}
      {help && !error && (
        <p id={helpId} className="text-footnote text-fg-secondary">
          {help}
        </p>
      )}
    </div>
  )
}

/** Form-level message (not tied to one field). Announced to screen readers. */
export function FormMessage({
  message,
  tone = "error",
}: {
  message?: string
  tone?: "error" | "info"
}) {
  if (!message) return null
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-md px-3 py-2.5 text-callout",
        tone === "error" ? "bg-danger-soft text-danger-ink" : "bg-brand-soft text-brand-ink"
      )}
    >
      <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
      {message}
    </p>
  )
}
