import * as React from "react"
import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-24 px-3 py-2.5 w-full min-w-0 rounded-md border border-input bg-surface text-callout text-fg transition-colors duration-150 outline-none placeholder:text-fg-muted focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45 aria-invalid:border-danger",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
