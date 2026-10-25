"use client"

import { useTransition } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

/**
 * Runs a server action that redirects on success or returns { ok: false, message } on failure,
 * and shows the failure as a toast instead of failing silently.
 */
export function ActionButton({
  action,
  children,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "onClick" | "action"> & {
  action: () => Promise<{ ok: boolean; message?: string } | void>
}) {
  const [pending, start] = useTransition()
  return (
    <Button
      {...props}
      loading={pending}
      onClick={() =>
        start(async () => {
          const r = await action()
          if (r && !r.ok) toast.error(r.message ?? "That didn't work.")
        })
      }
    >
      {children}
    </Button>
  )
}
