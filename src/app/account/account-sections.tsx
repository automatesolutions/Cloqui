"use client"

import { useState, useTransition } from "react"
import { ShieldCheck, ShieldOff } from "lucide-react"
import { toast } from "sonner"
import { Field, FormMessage } from "@/components/forms/field"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { confirmTwoFactorAction, deleteAccountAction, disableTwoFactorAction, startTwoFactorAction } from "./actions"

export function TwoFactorSection({ enabled }: { enabled: boolean }) {
  const [setup, setSetup] = useState<{ factorId: string; qr: string; secret: string } | null>(null)
  const [code, setCode] = useState("")
  const [error, setError] = useState<string>()
  const [turningOff, setTurningOff] = useState(false)
  const [pending, start] = useTransition()

  if (enabled && !turningOff) {
    return (
      <div className="grid gap-3">
        <p className="flex items-center gap-2 text-callout">
          <ShieldCheck aria-hidden className="size-5 text-brand-ink" strokeWidth={1.75} />
          On. You&apos;ll enter a code from your authenticator app when you sign in.
        </p>
        <Button variant="secondary" className="justify-self-start" onClick={() => setTurningOff(true)}>
          Turn off
        </Button>
      </div>
    )
  }

  if (enabled && turningOff) {
    return (
      <form
        className="grid max-w-sm gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          start(async () => {
            const r = await disableTwoFactorAction(code)
            if (!r.ok) return setError(r.message)
            toast.success("Two-step sign-in is off.")
            setTurningOff(false)
            setCode("")
          })
        }}
      >
        <FormMessage message={error} />
        <Field name="off-code" label="Enter a current code to turn it off" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
        <div className="flex gap-2">
          <Button type="submit" variant="danger" loading={pending} disabled={code.length !== 6}>
            <ShieldOff aria-hidden />
            Turn off
          </Button>
          <Button type="button" variant="ghost" onClick={() => setTurningOff(false)}>Keep it on</Button>
        </div>
      </form>
    )
  }

  if (!setup) {
    return (
      <div className="grid gap-3">
        <p className="text-callout text-fg-secondary">
          Off. Add a second step with an authenticator app like 1Password, Google Authenticator or Microsoft Authenticator.
        </p>
        <FormMessage message={error} />
        <Button
          className="justify-self-start"
          loading={pending}
          onClick={() =>
            start(async () => {
              const r = await startTwoFactorAction()
              if (!r.ok) return setError(r.message)
              setError(undefined)
              setSetup({ factorId: r.factorId, qr: r.qr, secret: r.secret })
            })
          }
        >
          Set up two-step sign-in
        </Button>
      </div>
    )
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        start(async () => {
          const r = await confirmTwoFactorAction(setup.factorId, code)
          if (!r.ok) return setError(r.message)
          toast.success("Two-step sign-in is on.")
          setSetup(null)
          setCode("")
        })
      }}
    >
      <ol className="grid list-decimal gap-2 pl-5 text-callout">
        <li>Scan this code with your authenticator app.</li>
        <li>Type the 6-digit code it shows.</li>
      </ol>
      <div className="flex flex-wrap items-start gap-6">
        {/* The QR is an SVG data URL from Supabase; a white tile keeps it scannable in dark mode. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={setup.qr} alt="QR code for your authenticator app" width={176} height={176} className="rounded-md bg-white p-2" />
        <div className="grid max-w-xs gap-1.5">
          <p className="text-footnote text-fg-secondary">Can&apos;t scan it? Enter this key instead:</p>
          <code className="rounded-sm bg-raised px-2 py-1.5 font-mono text-footnote break-all select-all">{setup.secret}</code>
        </div>
      </div>
      <FormMessage message={error} />
      <div className="grid max-w-sm gap-3">
        <Field name="setup-code" label="6-digit code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
        <div className="flex gap-2">
          <Button type="submit" loading={pending} disabled={code.length !== 6}>Turn on</Button>
          <Button type="button" variant="ghost" onClick={() => setSetup(null)}>Cancel</Button>
        </div>
      </div>
    </form>
  )
}

export function DeleteAccountSection({ email }: { email: string }) {
  const [typed, setTyped] = useState("")
  const [error, setError] = useState<string>()
  const [pending, start] = useTransition()
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" className="justify-self-start">Delete my account</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete your account?</AlertDialogTitle>
          <AlertDialogDescription>
            Your videos, messages, comments and tasks you created are deleted. Workspaces where you&apos;re the only person are deleted too. This can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FormMessage message={error} />
        <Field name="confirm-email" label={`Type ${email} to confirm`} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        <AlertDialogFooter>
          <AlertDialogCancel asChild><Button variant="secondary">Keep my account</Button></AlertDialogCancel>
          <Button
            variant="danger"
            loading={pending}
            disabled={typed.trim().toLowerCase() !== email.toLowerCase()}
            onClick={() =>
              start(async () => {
                const r = await deleteAccountAction(typed)
                if (r && !r.ok) setError(r.message)
              })
            }
          >
            Delete my account
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
