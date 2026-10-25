"use client"

import { useActionState } from "react"
import { Button } from "@/components/ui/button"
import { FormMessage } from "@/components/forms/field"
import type { FormState } from "@/lib/validation"

export function AcceptButton({
  action,
  label,
}: {
  action: (s: FormState) => Promise<FormState>
  label: string
}) {
  const [state, formAction, pending] = useActionState(action, {})
  return (
    <form action={formAction} className="grid gap-3">
      <FormMessage message={state.message} />
      <Button type="submit" loading={pending} className="w-full">
        {label}
      </Button>
    </form>
  )
}
