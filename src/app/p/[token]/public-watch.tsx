"use client"

import { useState, useTransition } from "react"
import { KeyRound } from "lucide-react"
import { Field, FormMessage } from "@/components/forms/field"
import { AccessChip } from "@/components/privacy/access-chip"
import { Button } from "@/components/ui/button"
import { formatDuration, relativeDate } from "@/lib/format"
import type { PublicView } from "@/server/public-links"
import { Player, PlayerProvider } from "../../v/[id]/player"
import { unlockPublicAction } from "./actions"

type Unlocked = Extract<PublicView, { kind: "ok" }>

export function PublicWatch({
  token,
  initial,
  ownerFirstName,
}: {
  token: string
  initial: Unlocked | null
  ownerFirstName: string
}) {
  const [state, setState] = useState<{ view: Unlocked; unlock: string | null } | null>(
    initial ? { view: initial, unlock: null } : null
  )
  if (!state) {
    return (
      <PublicPasscode
        token={token}
        ownerFirstName={ownerFirstName}
        onUnlocked={(view, unlock) => setState({ view, unlock })}
      />
    )
  }
  const { view, unlock } = state
  return (
    <PlayerProvider>
      <div className="mx-auto grid w-full max-w-4xl gap-5">
        <Player
          videoId={token}
          initial={view.playback}
          title={view.title}
          watermark={null}
          viewOnly
          playbackUrl={`/api/p/${token}/playback`}
          unlock={unlock}
          ended={{
            title: "This link stopped working",
            body: `${view.ownerFirstName} turned it off, or it ended. Ask them for a new one.`,
          }}
        />
        <div className="grid gap-2">
          <h1 className="text-title-2 font-bold break-words">{view.title}</h1>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-footnote text-fg-secondary">
            <span>{view.ownerFirstName}</span>
            <span aria-hidden>·</span>
            <span>{relativeDate(new Date(view.createdAt))}</span>
            {view.durationMs ? (
              <>
                <span aria-hidden>·</span>
                <span className="tnum">{formatDuration(view.durationMs)}</span>
              </>
            ) : null}
          </p>
          <AccessChip label="Anyone with the link" scope="public" className="justify-self-start" />
          {view.description && (
            <p className="mt-2 max-w-[70ch] text-callout whitespace-pre-line text-fg-secondary">
              {view.description}
            </p>
          )}
        </div>
      </div>
    </PlayerProvider>
  )
}

function PublicPasscode({
  token,
  ownerFirstName,
  onUnlocked,
}: {
  token: string
  ownerFirstName: string
  onUnlocked: (view: Unlocked, unlock: string) => void
}) {
  const [code, setCode] = useState("")
  const [error, setError] = useState<string>()
  const [pending, start] = useTransition()
  return (
    <div className="mx-auto w-full max-w-sm py-12 text-center">
      <span className="mx-auto mb-6 grid size-14 place-items-center rounded-lg bg-brand-soft text-brand-ink">
        <KeyRound aria-hidden className="size-7" strokeWidth={1.75} />
      </span>
      <h1 className="text-title-2 font-bold">This video needs a passcode</h1>
      <p className="mt-2 text-callout text-fg-secondary">
        Ask {ownerFirstName} for it if you don&apos;t have it.
      </p>
      <form
        className="mt-8 grid gap-4 text-left"
        onSubmit={(e) => {
          e.preventDefault()
          start(async () => {
            const res = await unlockPublicAction(token, code)
            if (!res.ok) return setError(res.message)
            onUnlocked(res.view, res.unlock)
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
