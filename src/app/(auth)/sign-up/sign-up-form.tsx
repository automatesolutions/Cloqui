"use client"

import { useActionState } from "react"
import { Button } from "@/components/ui/button"
import { Field, FormMessage } from "@/components/forms/field"
import type { FormState } from "@/lib/validation"
import { signUpAction } from "../actions"

export function SignUpForm({ next, email }: { next: string; email?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(signUpAction, {})
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormMessage message={state.message} />
      <input type="hidden" name="next" value={next} />
      <Field
        name="displayName"
        label="Your name"
        autoComplete="name"
        required
        defaultValue={state.values?.displayName}
        error={state.fieldErrors?.displayName}
        help="People you invite will see this."
      />
      <Field
        name="email"
        label="Work email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        defaultValue={state.values?.email ?? email}
        error={state.fieldErrors?.email}
      />
      <Field
        name="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        required
        minLength={10}
        error={state.fieldErrors?.password}
        help="At least 10 characters, with an uppercase letter, a lowercase letter and a number."
      />
      <Button type="submit" loading={pending} className="mt-2 w-full">
        Create account
      </Button>
    </form>
  )
}
