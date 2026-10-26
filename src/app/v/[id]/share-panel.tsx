"use client"

import { useState, useTransition } from "react"
import { Copy, Globe, ShieldCheck, UserPlus } from "lucide-react"
import { toast } from "sonner"
import { initials } from "@/components/app/initials"
import { FormMessage } from "@/components/forms/field"
import { AccessChip } from "@/components/privacy/access-chip"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import type { GrantView } from "@/server/videos"
import {
  changeGrantRoleAction,
  removeGrantAction,
  resolveRequestAction,
  setPasscodeAction,
  setPublicLinkAction,
  shareAction,
  updateSettingsAction,
} from "./actions"

type Settings = {
  workspaceVisible: boolean
  accessExpiresAt: string | null
  viewOnly: boolean
  watermark: boolean
}

export type SharePanelProps = {
  videoId: string
  isOwner: boolean
  ownerName: string
  workspaceName: string
  audience: { label: string; scope: "private" | "workspace" | "public"; people: boolean }
  grants: GrantView[]
  suggestions: { id: string; name: string; email: string }[]
  requests: { id: string; name: string; email: string }[]
  settings: Settings
  hasPasscode: boolean
  /** Only set for the owner. */
  publicLink: { url: string | null; allowed: boolean } | null
}

const roleLabel = { viewer: "Viewer", editor: "Editor" } as const

export function SharePanel(p: SharePanelProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="secondary">
          <ShieldCheck aria-hidden />
          Who can see this
          {p.requests.length > 0 && (
            <span className="ml-1 rounded-full bg-attention-soft px-2 text-caption font-semibold text-attention tnum">
              {p.requests.length}
              <span className="sr-only">
                {" "}
                access {p.requests.length === 1 ? "request" : "requests"}
              </span>
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-[440px]">
        <SheetHeader className="border-b border-border p-5">
          <SheetTitle>Who can see this</SheetTitle>
          <SheetDescription className="flex flex-wrap items-center gap-2">
            <AccessChip
              label={p.audience.label}
              scope={p.audience.scope}
              people={p.audience.people}
            />
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-8 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="min-w-0 flex-1 text-footnote text-fg-secondary">
              This link only opens for people on the list.
            </p>
            <CopyLinkButton path={`/v/${p.videoId}`} />
          </div>
          {p.isOwner && p.requests.length > 0 && (
            <Requests videoId={p.videoId} requests={p.requests} />
          )}
          {p.isOwner && <AddPeople videoId={p.videoId} suggestions={p.suggestions} />}
          <People {...p} />
          {p.isOwner && p.publicLink && (
            <PublicLink
              videoId={p.videoId}
              initial={p.publicLink}
              watermark={p.settings.watermark}
            />
          )}
          {p.isOwner && <Controls {...p} />}
          <p className="flex gap-2 text-footnote text-fg-secondary">
            <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
            Encrypted in transit and at rest.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  )
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success("Link copied.")
  } catch {
    toast.error("Your browser didn't let us copy. Select the link and copy it yourself.")
  }
}

function CopyLinkButton({ path }: { path: string }) {
  return (
    <Button variant="secondary" size="sm" onClick={() => copy(`${window.location.origin}${path}`)}>
      <Copy aria-hidden />
      Copy link
    </Button>
  )
}

function PublicLink({
  videoId,
  initial,
  watermark,
}: {
  videoId: string
  initial: { url: string | null; allowed: boolean }
  watermark: boolean
}) {
  const [url, setUrl] = useState(initial.url)
  const [confirming, setConfirming] = useState(false)
  const [pending, start] = useTransition()

  function turn(on: boolean) {
    start(async () => {
      const res = await setPublicLinkAction(videoId, on)
      if (!res.ok) return void toast.error(res.message)
      setUrl(res.url ?? null)
      toast.success(on ? "Public link is on." : "Public link is off. The old link no longer works.")
    })
  }

  return (
    <section aria-labelledby="pub-h" className="grid gap-3">
      <h3 id="pub-h" className="text-headline">
        Public link
      </h3>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Label htmlFor="public-link" className="text-callout font-medium">
            Anyone with the link can watch
          </Label>
          <p id="public-link-help" className="mt-1 text-footnote text-fg-secondary">
            {initial.allowed
              ? "No sign-in needed. Anyone who gets the link can watch and pass it on."
              : "Your workspace admins have turned off public links."}
          </p>
        </div>
        <Switch
          id="public-link"
          checked={!!url}
          disabled={pending || (!initial.allowed && !url)}
          onCheckedChange={(on) => (on ? setConfirming(true) : turn(false))}
          aria-describedby="public-link-help"
        />
      </div>
      {url && (
        <div className="grid gap-2 rounded-lg border border-attention/40 bg-attention-soft p-3">
          <p className="flex items-center gap-1.5 text-footnote font-medium text-attention">
            <Globe aria-hidden className="size-4" strokeWidth={1.75} />
            Anyone with this link can watch
          </p>
          <div className="flex gap-2">
            <Input
              readOnly
              value={url}
              aria-label="Public link"
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 font-mono text-footnote"
            />
            <Button variant="secondary" onClick={() => copy(url)}>
              <Copy aria-hidden />
              Copy
            </Button>
          </div>
          <p className="text-footnote text-fg-secondary">
            Viewers can only watch: no comments, no download. Turning it off stops the link right
            away, and turning it on again makes a new one.
            {watermark ? " Viewers don't sign in, so no email shows on the video for them." : ""}
          </p>
        </div>
      )}
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Turn on a public link?</AlertDialogTitle>
            <AlertDialogDescription>
              Anyone who gets the link can watch without signing in, and pass it on.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="secondary">Keep it private</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button onClick={() => turn(true)}>Turn on link</Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

function Requests({
  videoId,
  requests,
}: {
  videoId: string
  requests: SharePanelProps["requests"]
}) {
  const [pending, start] = useTransition()
  return (
    <section aria-labelledby="req-h" className="grid gap-3">
      <h3 id="req-h" className="text-headline">
        Asking for access
      </h3>
      <ul className="grid gap-2">
        {requests.map((r) => (
          <li
            key={r.id}
            className="grid gap-3 rounded-lg border border-attention/40 bg-attention-soft p-3"
          >
            <div className="min-w-0">
              <p className="truncate text-callout font-medium">{r.name}</p>
              <p className="truncate text-footnote text-fg-secondary">{r.email}</p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const res = await resolveRequestAction(videoId, r.id, true)
                    if (res.ok) toast.success(`${r.name.split(" ")[0]} can watch now.`)
                    else toast.error(res.message)
                  })
                }
              >
                Let them watch
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const res = await resolveRequestAction(videoId, r.id, false)
                    if (res.ok) toast.success("Request declined.")
                    else toast.error(res.message)
                  })
                }
              >
                Decline
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function AddPeople({
  videoId,
  suggestions,
}: {
  videoId: string
  suggestions: SharePanelProps["suggestions"]
}) {
  const [emails, setEmails] = useState("")
  const [role, setRole] = useState<"viewer" | "editor">("viewer")
  const [msg, setMsg] = useState<{ ok: boolean; text?: string }>({ ok: true })
  const [pending, start] = useTransition()
  return (
    <section aria-labelledby="add-h" className="grid gap-3">
      <h3 id="add-h" className="text-headline">
        Add people
      </h3>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          start(async () => {
            const res = await shareAction(videoId, emails, role)
            setMsg({ ok: res.ok, text: res.message })
            if (res.ok) setEmails("")
          })
        }}
      >
        {msg.text && <FormMessage message={msg.text} tone={msg.ok ? "info" : "error"} />}
        <div className="grid gap-1.5">
          <Label htmlFor="share-emails" className="text-footnote font-medium">
            Emails or names
          </Label>
          <Input
            id="share-emails"
            list="share-suggestions"
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            placeholder="maria@acme.co"
            autoComplete="off"
          />
          <datalist id="share-suggestions">
            {suggestions.map((s) => (
              <option key={s.id} value={s.email}>
                {s.name}
              </option>
            ))}
          </datalist>
          <p className="text-footnote text-fg-secondary">
            People outside the workspace become guests. They only see this video.
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={role} onValueChange={(v) => setRole(v as "viewer" | "editor")}>
            <SelectTrigger aria-label={`${roleLabel[role]}, role for new people`} className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="viewer">Viewer</SelectItem>
              <SelectItem value="editor">Editor</SelectItem>
            </SelectContent>
          </Select>
          <Button type="submit" loading={pending} disabled={!emails.trim()} className="flex-1">
            <UserPlus aria-hidden />
            Share
          </Button>
        </div>
      </form>
    </section>
  )
}

function People(p: SharePanelProps) {
  const [pending, start] = useTransition()
  const [removing, setRemoving] = useState<GrantView | null>(null)
  return (
    <section aria-labelledby="people-h" className="grid gap-3">
      <h3 id="people-h" className="text-headline">
        People with access
      </h3>
      <ul className="divide-y divide-border rounded-lg border border-border">
        <li className="flex items-center gap-3 px-3 py-2.5">
          <Avatar name={p.ownerName} />
          <span className="min-w-0 flex-1 truncate text-callout font-medium">
            {p.ownerName}
            {p.isOwner && <span className="font-normal text-fg-secondary"> (you)</span>}
          </span>
          <span className="text-footnote text-fg-secondary">Owner</span>
        </li>
        {p.settings.workspaceVisible && (
          <li className="flex items-center gap-3 px-3 py-2.5">
            <span
              aria-hidden
              className="grid size-8 place-items-center rounded-full bg-raised text-caption font-semibold text-fg-secondary"
            >
              {initials(p.workspaceName)}
            </span>
            <span className="min-w-0 flex-1 truncate text-callout">
              Everyone in {p.workspaceName}
            </span>
            <span className="text-footnote text-fg-secondary">Viewer</span>
          </li>
        )}
        {p.grants.map((g) => (
          <li key={g.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
            <Avatar name={g.name} />
            <div className="min-w-[9rem] flex-1">
              <p className="truncate text-callout font-medium">
                {g.name}
                {g.isGuest && (
                  <span className="ml-1.5 text-footnote font-normal text-fg-secondary">Guest</span>
                )}
              </p>
              {g.email !== g.name && (
                <p className="truncate text-footnote text-fg-secondary">{g.email}</p>
              )}
            </div>
            {p.isOwner ? (
              <>
                <Select
                  value={g.role}
                  disabled={pending}
                  onValueChange={(v) =>
                    start(async () => {
                      const res = await changeGrantRoleAction(p.videoId, g.id, v)
                      if (!res.ok) toast.error(res.message)
                    })
                  }
                >
                  <SelectTrigger
                    aria-label={`${roleLabel[g.role]}, ${g.name}'s role`}
                    className="w-28"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viewer">Viewer</SelectItem>
                    <SelectItem value="editor">Editor</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" variant="ghost" onClick={() => setRemoving(g)}>
                  Remove
                </Button>
              </>
            ) : (
              <span className="text-footnote text-fg-secondary">{roleLabel[g.role]}</span>
            )}
          </li>
        ))}
      </ul>
      {p.grants.length === 0 && !p.settings.workspaceVisible && (
        <p className="text-callout text-fg-secondary">
          Only {p.isOwner ? "you" : p.ownerName} can see this right now.
        </p>
      )}
      <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {removing?.name.split(" ")[0]}&apos;s access?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {removing?.name.split(" ")[0]} will stop seeing this right away, even if the video is
              open.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="secondary">Keep access</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant="danger"
                onClick={() => {
                  const g = removing
                  if (!g) return
                  start(async () => {
                    const res = await removeGrantAction(p.videoId, g.id)
                    if (res.ok) toast.success(`${g.name.split(" ")[0]} no longer has access.`)
                    else toast.error(res.message)
                  })
                }}
              >
                Remove access
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

function Controls(p: SharePanelProps) {
  const [s, setS] = useState<Settings>(p.settings)
  const [pending, start] = useTransition()
  const [passcode, setPasscode] = useState("")

  function save(next: Settings) {
    const prev = s
    setS(next)
    start(async () => {
      const res = await updateSettingsAction(p.videoId, next)
      if (!res.ok) {
        setS(prev)
        toast.error(res.message)
      }
    })
  }

  const today = new Date().toISOString().slice(0, 10)
  return (
    <section aria-labelledby="ctl-h" className="grid gap-5">
      <h3 id="ctl-h" className="text-headline">
        Settings
      </h3>
      <Toggle
        id="ws-visible"
        label={`Everyone in ${p.workspaceName} can watch`}
        help="Off: only the people listed above. Guests never get this."
        checked={s.workspaceVisible}
        disabled={pending}
        onChange={(v) => save({ ...s, workspaceVisible: v })}
      />
      <Toggle
        id="view-only"
        label="View only"
        help="Hides the download option for viewers. It can't stop someone recording their screen."
        checked={s.viewOnly}
        disabled={pending}
        onChange={(v) => save({ ...s, viewOnly: v })}
      />
      <Toggle
        id="watermark"
        label="Show each viewer's email on the video"
        help="Makes leaks easy to trace. It doesn't make them impossible."
        checked={s.watermark}
        disabled={pending}
        onChange={(v) => save({ ...s, watermark: v })}
      />
      <div className="grid gap-1.5">
        <Label htmlFor="expires" className="text-callout font-medium">
          Access ends
        </Label>
        <div className="flex gap-2">
          <Input
            id="expires"
            type="date"
            min={today}
            value={s.accessExpiresAt ?? ""}
            disabled={pending}
            onChange={(e) => save({ ...s, accessExpiresAt: e.target.value || null })}
            className="flex-1"
          />
          {s.accessExpiresAt && (
            <Button
              variant="ghost"
              onClick={() => save({ ...s, accessExpiresAt: null })}
              disabled={pending}
            >
              Clear
            </Button>
          )}
        </div>
        <p className="text-footnote text-fg-secondary">
          {s.accessExpiresAt
            ? "After this day, only you can watch."
            : "No end date. People keep access until you remove them."}
        </p>
      </div>
      <form
        className="grid gap-1.5"
        onSubmit={(e) => {
          e.preventDefault()
          start(async () => {
            const res = await setPasscodeAction(p.videoId, passcode)
            if (res.ok) toast.success(res.message ?? "Saved.")
            else toast.error(res.message)
            if (res.ok) setPasscode("")
          })
        }}
      >
        <Label htmlFor="passcode" className="text-callout font-medium">
          Passcode
        </Label>
        <div className="flex gap-2">
          <Input
            id="passcode"
            type="password"
            autoComplete="new-password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder={p.hasPasscode ? "Set a new passcode" : "Optional"}
            className="flex-1"
          />
          <Button type="submit" variant="secondary" disabled={pending || passcode.length < 4}>
            {p.hasPasscode ? "Change" : "Set"}
          </Button>
        </div>
        <p className="text-footnote text-fg-secondary">
          {p.hasPasscode
            ? "Viewers need the passcode too. Changing it asks everyone again."
            : "Everyone watching needs to type this, public link included. Share it separately."}
        </p>
        {p.hasPasscode && (
          <Button
            type="button"
            variant="ghost"
            className="justify-self-start"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await setPasscodeAction(p.videoId, null)
                if (res.ok) toast.success(res.message ?? "Saved.")
                else toast.error(res.message)
              })
            }
          >
            Remove passcode
          </Button>
        )}
      </form>
    </section>
  )
}

function Toggle({
  id,
  label,
  help,
  checked,
  disabled,
  onChange,
}: {
  id: string
  label: string
  help: string
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-callout font-medium">
          {label}
        </Label>
        <p id={`${id}-help`} className="mt-1 text-footnote text-fg-secondary">
          {help}
        </p>
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
        aria-describedby={`${id}-help`}
      />
    </div>
  )
}

function Avatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="grid size-8 shrink-0 place-items-center rounded-full border border-border bg-raised text-caption font-semibold text-fg-secondary"
    >
      {initials(name)}
    </span>
  )
}
