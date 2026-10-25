"use client"

import { useActionState, useState, useTransition } from "react"
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
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import type { FormState } from "@/lib/validation"
import { deleteWorkspaceAction, setRequireTwoFactorAction } from "../actions"

export function RequireTwoFactorToggle({
  slug,
  initial,
  missing,
}: {
  slug: string
  initial: boolean
  missing: { id: string; name: string }[]
}) {
  const [on, setOn] = useState(initial)
  const [error, setError] = useState<string>()
  const [pending, start] = useTransition()
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor="require-2fa" className="text-callout font-normal">
          Everyone must use two-step sign-in
        </Label>
        <Switch
          id="require-2fa"
          checked={on}
          disabled={pending}
          onCheckedChange={(next) =>
            start(async () => {
              const r = await setRequireTwoFactorAction(slug, next)
              if (!r.ok) return setError(r.message)
              setError(undefined)
              setOn(next)
              toast.success(next ? "Two-step sign-in is now required." : "Two-step sign-in is now optional.")
            })
          }
        />
      </div>
      <FormMessage message={error} />
      {missing.length > 0 ? (
        <p className="text-footnote text-fg-secondary">
          {on ? "Can't open the workspace until they set it up: " : "Not set up yet, so they'd lose access until they do: "}
          {missing.map((m) => m.name).join(", ")}.
        </p>
      ) : (
        <p className="text-footnote text-fg-secondary">Everyone here has it set up.</p>
      )}
    </div>
  )
}

export function RetentionForm({
  action,
  videoDays,
  messageDays,
}: {
  action: (state: FormState, data: FormData) => Promise<FormState>
  videoDays: number | null
  messageDays: number | null
}) {
  const [state, formAction, pending] = useActionState(action, {})
  return (
    <form action={formAction} className="grid max-w-lg gap-5">
      <FormMessage message={state.message} tone={state.ok ? "info" : "error"} />
      <Field
        name="retentionVideoDays"
        label="Delete videos after (days)"
        type="number"
        inputMode="numeric"
        min={7}
        max={3650}
        placeholder="Keep forever"
        defaultValue={videoDays ?? ""}
        error={state.fieldErrors?.retentionVideoDays}
        help="Leave empty to keep them. Deleted videos are gone for good, files included."
      />
      <Field
        name="retentionMessageDays"
        label="Delete messages after (days)"
        type="number"
        inputMode="numeric"
        min={7}
        max={3650}
        placeholder="Keep forever"
        defaultValue={messageDays ?? ""}
        error={state.fieldErrors?.retentionMessageDays}
        help="Applies to every channel and direct message, and their attachments."
      />
      <Button type="submit" className="justify-self-start" loading={pending}>
        Save
      </Button>
    </form>
  )
}

export function DeleteWorkspaceButton({ slug, name }: { slug: string; name: string }) {
  const [typed, setTyped] = useState("")
  const [error, setError] = useState<string>()
  const [pending, start] = useTransition()
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" className="justify-self-start">Delete workspace</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Every video, message, task and file in it is deleted for everyone. This can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FormMessage message={error} />
        <Field name="confirm-name" label={`Type ${name} to confirm`} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        <AlertDialogFooter>
          <AlertDialogCancel asChild><Button variant="secondary">Keep it</Button></AlertDialogCancel>
          <Button
            variant="danger"
            loading={pending}
            disabled={typed.trim() !== name.trim()}
            onClick={() =>
              start(async () => {
                const r = await deleteWorkspaceAction(slug, typed)
                if (r && !r.ok) setError(r.message)
              })
            }
          >
            Delete workspace
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
