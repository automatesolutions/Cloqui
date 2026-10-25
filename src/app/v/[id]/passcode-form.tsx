"use client"

import { useState, useTransition } from "react"
import { KeyRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Field, FormMessage } from "@/components/forms/field"
import { unlockAction } from "./actions"

export function PasscodeForm({
  videoId,
  title,
  ownerName,
}: {
  videoId: string
  title: string
  ownerName: string | null
}) {
  const [code, setCode] = useState("")
  const [error, setError] = useState<string>()
  const [pending, start] = useTransition()
  return (
    <div className="mx-auto w-full max-w-sm text-center">
      <span className="mx-auto mb-6 grid size-14 place-items-center rounded-lg bg-brand-soft text-brand-ink">
        <KeyRound aria-hidden className="size-7" strokeWidth={1.75} />
      </span>
      <h1 className="text-title-2 font-bold">This video needs a passcode</h1>
      <p className="mt-2 text-callout text-fg-secondary">
        &ldquo;{title}&rdquo; is shared with you. {ownerName ?? "The owner"} also set a passcode.
        Ask them for it if you don&apos;t have it.
      </p>
      <form
        className="mt-8 grid gap-4 text-left"
        onSubmit={(e) => {
          e.preventDefault()
          start(async () => {
            const res = await unlockAction(videoId, code)
            if (!res.ok) setError(res.message)
          })
        }}
      >
        <FormMessage message={error} />
        <Field
          name="passcode"
          label="Passcode"
          type="password"
          autoComplete="off"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
        />
        <Button type="submit" loading={pending} disabled={!code}>
          Unlock video
        </Button>
      </form>
    </div>
  )
}
