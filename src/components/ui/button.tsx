import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"
import { Loader2 } from "lucide-react"

// Cloqui: 44 px default hit area (/hig), one primary per view, press = scale(.98).
const buttonVariants = cva(
  "group/button relative inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-transparent font-medium whitespace-nowrap transition-[background-color,border-color,color,transform] duration-150 ease-out outline-none select-none active:not-aria-[haspopup]:scale-[.98] disabled:pointer-events-none disabled:opacity-45 aria-invalid:border-danger [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5 [&_svg]:stroke-[1.75]",
  {
    variants: {
      variant: {
        default: "bg-brand text-on-brand hover:bg-brand-hover",
        secondary:
          "border-border-strong bg-surface text-fg hover:bg-raised aria-expanded:bg-raised",
        outline:
          "border-border-strong bg-surface text-fg hover:bg-raised aria-expanded:bg-raised",
        ghost:
          "text-fg-secondary hover:bg-raised hover:text-fg aria-expanded:bg-raised aria-expanded:text-fg",
        destructive: "bg-danger-soft text-danger-ink hover:bg-danger/20",
        danger: "bg-danger text-background hover:bg-danger/90",
        link: "h-auto px-0 text-brand underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-4 text-callout",
        // Dense toolbars only. The ::after pads the hit area to 44 px.
        sm: "h-9 px-3 text-footnote after:absolute after:-inset-1 after:content-[''] [&_svg:not([class*='size-'])]:size-4",
        lg: "h-13 px-[22px] text-body",
        icon: "size-11",
        "icon-sm":
          "size-9 after:absolute after:-inset-1 after:content-[''] [&_svg:not([class*='size-'])]:size-4",
        // shadcn internals still reference these; keep them at the dense size.
        xs: "h-9 px-3 text-footnote after:absolute after:-inset-1 after:content-['']",
        "icon-xs":
          "size-9 after:absolute after:-inset-1 after:content-[''] [&_svg:not([class*='size-'])]:size-4",
        "icon-lg": "size-13",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    /** Shows a spinner, keeps the label and width, and blocks clicks. */
    loading?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading && (
            <Loader2 aria-hidden className="absolute animate-spin" />
          )}
          <span
            className={cn(
              "inline-flex items-center gap-2",
              loading && "opacity-0"
            )}
          >
            {children}
          </span>
        </>
      )}
    </Comp>
  )
}

export { Button, buttonVariants }
