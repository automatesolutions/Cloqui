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
import {
  deleteWorkspaceAction,
  setAllowPublicLinksAction,
  setRequireTwoFactorAction,
} from "../actions"

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
              toast.success(
                next ? "Two-step sign-in is now required." : "Two-step sign-in is now optional."
              )
            })
          }
        />
      </div>
      <FormMessage message={error} />
      {missing.length > 0 ? (
        <p className="text-footnote text-fg-secondary">
          {on
            ? "Can't open the workspace until they set it up: "
            : "Not set up yet, so they'd lose access until they do: "}
          {missing.map((m) => m.name).join(", ")}.
        </p>
      ) : (
        <p className="text-footnote text-fg-secondary">Everyone here has it set up.</p>
      )}
    </div>
  )
}

export function AllowPublicLinksToggle({
  slug,
  initial,
  count,
}: {
  slug: string
  initial: boolean
  count: number
}) {
  const [on, setOn] = useState(initial)
  const [live, setLive] = useState(count)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string>()
  const [pending, start] = useTransition()

  function save(next: boolean) {
    start(async () => {
      const r = await setAllowPublicLinksAction(slug, next)
      if (!r.ok) return setError(r.message)
      setError(undefined)
      setOn(next)
      if (!next) setLive(0)
      toast.success(
        next
          ? "Video owners can turn on public links."
          : r.removed
            ? `Public links are off. ${r.removed} ${r.removed === 1 ? "link" : "links"} stopped working.`
            : "Public links are off."
      )
    })
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor="allow-public" className="text-callout font-normal">
          Video owners can turn on a public link
        </Label>
        <Switch
          id="allow-public"
          checked={on}
          disabled={pending}
          aria-describedby="allow-public-help"
          onCheckedChange={(next) => (next || live === 0 ? save(next) : setConfirming(true))}
        />
      </div>
      <FormMessage message={error} />
      <p id="allow-public-help" className="text-footnote text-fg-secondary">
        {on
          ? live > 0
            ? `Anyone with the link can watch ${live} ${live === 1 ? "video" : "videos"} here, without signing in. Turning this off stops every link right away.`
            : "No video here has a public link right now. Each one is off until its owner turns it on."
          : "Every video here only opens for invited people."}
      </p>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Turn off public links?</AlertDialogTitle>
            <AlertDialogDescription>
              {live === 1 ? "1 public link stops" : `${live} public links stop`} working right away.
              Turning this back on doesn&apos;t bring them back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="secondary">Keep them</Button>
            </AlertDialogCancel>
            <Button
              variant="danger"
              onClick={() => {
                setConfirming(false)
                save(false)
              }}
            >
              Turn off links
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
        <Button variant="destructive" className="justify-self-start">
          Delete workspace
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Every video, message, task and file in it is deleted for everyone. This can&apos;t be
            undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FormMessage message={error} />
        <Field
          name="confirm-name"
          label={`Type ${name} to confirm`}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
        />
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="secondary">Keep it</Button>
          </AlertDialogCancel>
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
