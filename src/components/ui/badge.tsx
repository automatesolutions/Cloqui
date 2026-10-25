import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

const badgeVariants = cva(
  "group/badge inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-sm border border-transparent px-2 text-caption font-medium whitespace-nowrap [&>svg]:pointer-events-none [&>svg]:size-4 [&>svg]:stroke-[1.75]",
  {
    variants: {
      variant: {
        default: "bg-brand-soft text-brand",
        private: "bg-brand-soft text-brand",
        workspace: "border-border bg-raised text-fg-secondary",
        attention: "bg-attention-soft text-attention",
        destructive: "bg-danger-soft text-danger",
        live: "bg-danger-soft text-danger tracking-[0.06em] uppercase",
        secondary: "border-border bg-raised text-fg-secondary",
        outline: "border-border-strong text-fg",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
