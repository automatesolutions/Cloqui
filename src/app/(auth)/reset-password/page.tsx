"use client"

import { useActionState } from "react"
import { Button } from "@/components/ui/button"
import { Field, FormMessage } from "@/components/forms/field"
import type { FormState } from "@/lib/validation"
import { resetPasswordAction } from "../actions"
import { AuthHeading } from "../auth-shell"

export default function ResetPasswordPage() {
  const [state, action, pending] = useActionState<FormState, FormData>(resetPasswordAction, {})
  return (
    <>
      <AuthHeading title="Choose a new password" />
      <form action={action} className="grid gap-4" noValidate>
        <FormMessage message={state.message} />
        <Field
          name="password"
          label="New password"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          error={state.fieldErrors?.password}
          help="At least 10 characters, with an uppercase letter, a lowercase letter and a number."
        />
        <Button type="submit" loading={pending} className="mt-2 w-full">
          Save password
        </Button>
      </form>
    </>
  )
}
