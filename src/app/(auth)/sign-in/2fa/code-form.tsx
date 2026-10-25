"use client"

import { useState, useTransition } from "react"
import { verifySignInCodeAction } from "@/app/account/actions"
import { signOutAction } from "@/app/(auth)/actions"
import { Field, FormMessage } from "@/components/forms/field"
import { Button } from "@/components/ui/button"

export function CodeForm({ next }: { next: string }) {
  const [code, setCode] = useState("")
  const [error, setError] = useState<string>()
  const [pending, start] = useTransition()
  return (
    <div className="grid gap-6">
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          start(async () => {
            const r = await verifySignInCodeAction(code, next)
            if (r && !r.ok) setError(r.message)
          })
        }}
      >
        <FormMessage message={error} />
        <Field
          name="code"
          label="6-digit code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          autoFocus
          required
        />
        <Button type="submit" loading={pending} disabled={code.length !== 6}>
          Verify
        </Button>
      </form>
      <form action={signOutAction}>
        <Button type="submit" variant="ghost" className="w-full">
          Use a different account
        </Button>
      </form>
    </div>
  )
}
