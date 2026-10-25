import * as React from "react"
import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-11 px-3 w-full min-w-0 rounded-md border border-input bg-surface text-callout text-fg transition-colors duration-150 outline-none placeholder:text-fg-muted focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45 aria-invalid:border-danger file:mr-3 file:inline-flex file:h-8 file:border-0 file:bg-transparent file:text-footnote file:font-medium file:text-fg",
        className
      )}
      {...props}
    />
  )
}

export { Input }
