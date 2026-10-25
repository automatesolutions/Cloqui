"use client"

import { useActionState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Field, FormMessage } from "@/components/forms/field"
import type { FormState } from "@/lib/validation"
import { forgotPasswordAction } from "../actions"
import { AuthHeading } from "../auth-shell"

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState<FormState, FormData>(forgotPasswordAction, {})
  return (
    <>
      <AuthHeading title="Reset your password" body="We'll email you a link to choose a new one." />
      <form action={action} className="grid gap-4" noValidate>
        <FormMessage message={state.message} />
        <Field
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          defaultValue={state.values?.email}
          error={state.fieldErrors?.email}
        />
        <Button type="submit" loading={pending} className="mt-2 w-full">
          Send link
        </Button>
      </form>
      <Button variant="ghost" asChild className="mt-6">
        <Link href="/sign-in">Back to sign in</Link>
      </Button>
    </>
  )
}
