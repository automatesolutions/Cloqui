"use client"

import { useActionState, useState, useTransition } from "react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { FormMessage } from "@/components/forms/field"
import type { FormState } from "@/lib/validation"
import { roleHelp, roleLabels, type AssignableRole } from "@/lib/roles"

export function InviteForm({
  action,
  roles,
}: {
  action: (state: FormState, data: FormData) => Promise<FormState>
  roles: AssignableRole[]
}) {
  const [state, formAction, pending] = useActionState(action, {})
  const [role, setRole] = useState<AssignableRole>("member")
  return (
    <form action={formAction} className="grid gap-4">
      <FormMessage message={state.message} tone={state.ok ? "info" : "error"} />
      <div className="grid gap-1.5">
        <Label htmlFor="emails" className="text-footnote font-medium">
          Emails
        </Label>
        <Textarea
          id="emails"
          name="emails"
          placeholder="maria@acme.co, sam@acme.co"
          defaultValue={state.ok ? "" : state.values?.emails}
          key={state.ok ? "reset" : "keep"}
          aria-invalid={state.fieldErrors?.emails ? true : undefined}
          aria-describedby={state.fieldErrors?.emails ? "emails-err" : "emails-help"}
          className="min-h-20"
        />
        {state.fieldErrors?.emails ? (
          <p id="emails-err" className="text-footnote text-danger">
            {state.fieldErrors.emails}
          </p>
        ) : (
          <p id="emails-help" className="text-footnote text-fg-secondary">
            Separate emails with commas or new lines. Each person gets a link that only works for
            their email.
          </p>
        )}
      </div>
      <div className="grid gap-1.5 sm:max-w-xs">
        <Label htmlFor="role" className="text-footnote font-medium">
          Role
        </Label>
        <input type="hidden" name="role" value={role} />
        <Select value={role} onValueChange={(v) => setRole(v as AssignableRole)}>
          <SelectTrigger id="role" className="h-11 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {roles.map((r) => (
              <SelectItem key={r} value={r}>
                {roleLabels[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-footnote text-fg-secondary">{roleHelp[role]}</p>
      </div>
      <Button type="submit" loading={pending} className="justify-self-start">
        Send invites
      </Button>
    </form>
  )
}

export function RoleSelect({
  name,
  role,
  roles,
  onChange,
}: {
  name: string
  role: AssignableRole
  roles: AssignableRole[]
  onChange: (role: string) => Promise<FormState>
}) {
  const [value, setValue] = useState(role)
  const [pending, start] = useTransition()
  return (
    <Select
      value={value}
      disabled={pending}
      onValueChange={(next) =>
        start(async () => {
          const prev = value
          setValue(next as AssignableRole)
          const res = await onChange(next)
          if (!res.ok) {
            setValue(prev)
            toast.error(res.message ?? "That didn't work.")
          } else {
            toast.success(`${name} is now ${roleLabels[next as AssignableRole].toLowerCase()}.`)
          }
        })
      }
    >
      <SelectTrigger aria-label={`${roleLabels[value]}, ${name}'s role`} className="h-11 w-32">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {roles.map((r) => (
          <SelectItem key={r} value={r}>
            {roleLabels[r]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function ConfirmAction({
  trigger,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  successMessage,
}: {
  trigger: string
  title: string
  body: string
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => Promise<FormState>
  successMessage: string
}) {
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm">
          {trigger}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="secondary">{cancelLabel}</Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              variant="danger"
              loading={pending}
              onClick={(e) => {
                e.preventDefault()
                start(async () => {
                  const res = await onConfirm()
                  setOpen(false)
                  if (res.ok) toast.success(successMessage)
                  else toast.error(res.message ?? "That didn't work.")
                })
              }}
            >
              {confirmLabel}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
