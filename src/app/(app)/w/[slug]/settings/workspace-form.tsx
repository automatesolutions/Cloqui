"use client"

import { useActionState } from "react"
import { Button } from "@/components/ui/button"
import { Field, FormMessage } from "@/components/forms/field"
import type { FormState } from "@/lib/validation"

export function WorkspaceForm({
  action,
  name,
  domain,
  canEdit,
}: {
  action: (state: FormState, data: FormData) => Promise<FormState>
  name: string
  domain: string | null
  canEdit: boolean
}) {
  const [state, formAction, pending] = useActionState(action, {})
  return (
    <form action={formAction} className="grid max-w-lg gap-5">
      <FormMessage message={state.message} tone={state.ok ? "info" : "error"} />
      <Field
        name="name"
        label="Workspace name"
        defaultValue={name}
        disabled={!canEdit}
        required
        error={state.fieldErrors?.name}
      />
      <Field
        name="allowedEmailDomain"
        label="Who can join"
        placeholder="acme.co"
        defaultValue={domain ?? ""}
        disabled={!canEdit}
        error={state.fieldErrors?.allowedEmailDomain}
        help="Add your company's email domain to only allow people with that email. Guests can still be invited to single items. Leave it empty to allow any invited email."
      />
      {canEdit ? (
        <Button type="submit" loading={pending} className="justify-self-start">
          Save changes
        </Button>
      ) : (
        <p className="text-footnote text-fg-secondary">Only admins can change these settings.</p>
      )}
    </form>
  )
}
