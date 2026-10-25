"use client"

import { useActionState, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Field, FormMessage } from "@/components/forms/field"
import type { FormState } from "@/lib/validation"
import { magicLinkAction, signInAction } from "../actions"

export function SignInForm({ next, notice }: { next: string; notice?: string }) {
  const [mode, setMode] = useState<"password" | "link">("password")
  const [pwState, pwAction, pwPending] = useActionState<FormState, FormData>(signInAction, {})
  const [linkState, linkAction, linkPending] = useActionState<FormState, FormData>(
    magicLinkAction,
    {}
  )
  const state = mode === "password" ? pwState : linkState

  return (
    <div className="grid gap-6">
      {notice && !state.message && <FormMessage tone="info" message={notice} />}
      <FormMessage message={state.message} />

      <div
        role="radiogroup"
        aria-label="How to sign in"
        className="grid grid-cols-2 gap-1 rounded-md border border-border bg-surface p-1"
      >
        {(
          [
            ["password", "Password"],
            ["link", "Email me a link"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={mode === value}
            onClick={() => setMode(value)}
            className="h-11 rounded-sm text-callout font-medium text-fg-secondary transition-colors duration-150 aria-checked:bg-raised aria-checked:text-fg aria-checked:shadow-sm"
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "password" ? (
        <form action={pwAction} className="grid gap-4" noValidate>
          <input type="hidden" name="next" value={next} />
          <Field
            name="email"
            label="Email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            defaultValue={pwState.values?.email}
            error={pwState.fieldErrors?.email}
          />
          <Field
            name="password"
            label="Password"
            type="password"
            autoComplete="current-password"
            required
            error={pwState.fieldErrors?.password}
          />
          <Button type="submit" loading={pwPending} className="mt-2 w-full">
            Sign in
          </Button>
          <Link
            href="/forgot-password"
            className="inline-flex min-h-11 items-center justify-self-start text-footnote text-brand underline-offset-4 hover:underline"
          >
            Forgot password?
          </Link>
        </form>
      ) : (
        <form action={linkAction} className="grid gap-4" noValidate>
          <input type="hidden" name="next" value={next} />
          <Field
            name="email"
            label="Email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            defaultValue={linkState.values?.email}
            error={linkState.fieldErrors?.email}
            help="We'll send a link that signs you in. It works once."
          />
          <Button type="submit" loading={linkPending} className="mt-2 w-full">
            Email me a link
          </Button>
        </form>
      )}
    </div>
  )
}
