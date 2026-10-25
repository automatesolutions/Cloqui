"use client"

import { useOptimistic, useState, useTransition } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { initials } from "@/components/app/initials"
import { formatDuration, relativeDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import { addCommentAction, deleteCommentAction, toggleReactionAction } from "./actions"
import { usePlayer } from "./player"

const EMOJIS = ["👍", "❤️", "😂", "🎉", "👀", "✅"] as const
const EMOJI_NAMES: Record<string, string> = {
  "👍": "thumbs up",
  "❤️": "heart",
  "😂": "laughing",
  "🎉": "celebrate",
  "👀": "eyes",
  "✅": "done",
}

export function Reactions({
  videoId,
  initial,
}: {
  videoId: string
  initial: { emoji: string; count: number; mine: boolean }[]
}) {
  const player = usePlayer()
  const [state, apply] = useOptimistic(initial, (cur, emoji: string) => {
    const existing = cur.find((r) => r.emoji === emoji)
    if (!existing) return [...cur, { emoji, count: 1, mine: true }]
    return cur
      .map((r) =>
        r.emoji === emoji ? { ...r, mine: !r.mine, count: r.count + (r.mine ? -1 : 1) } : r
      )
      .filter((r) => r.count > 0)
  })
  const [, start] = useTransition()
  return (
    <div role="group" aria-label="Reactions" className="flex flex-wrap gap-1.5">
      {EMOJIS.map((e) => {
        const r = state.find((x) => x.emoji === e)
        return (
          <button
            key={e}
            type="button"
            aria-pressed={!!r?.mine}
            aria-label={`${EMOJI_NAMES[e]}${r?.count ? `, ${r.count}` : ""}`}
            onClick={() =>
              start(async () => {
                apply(e)
                const res = await toggleReactionAction(videoId, e, player?.currentMs() ?? null)
                if (!res.ok) toast.error(res.message ?? "That didn't work.")
              })
            }
            className={cn(
              "inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-full border px-3 text-callout transition-colors duration-150",
              r?.mine
                ? "border-brand bg-brand-soft text-brand-ink"
                : "border-border bg-surface hover:bg-raised"
            )}
          >
            <span aria-hidden>{e}</span>
            {r?.count ? <span className="text-footnote font-medium tnum">{r.count}</span> : null}
          </button>
        )
      })}
    </div>
  )
}

type Comment = {
  id: string
  body: string
  atMs: number | null
  createdAt: Date
  authorId: string
  authorName: string
}

export function Comments({
  videoId,
  comments,
  viewerId,
}: {
  videoId: string
  comments: Comment[]
  viewerId: string
}) {
  const player = usePlayer()
  const [body, setBody] = useState("")
  const [pinTime, setPinTime] = useState(true)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string>()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const at = pinTime ? (player?.currentMs() ?? 0) : null
    start(async () => {
      const res = await addCommentAction(videoId, body, at)
      if (!res.ok) return setError(res.message)
      setError(undefined)
      setBody("")
    })
  }

  return (
    <section aria-labelledby="comments-h" className="grid gap-5">
      <h2 id="comments-h" className="text-title-3 font-medium">
        Comments <span className="text-fg-secondary tnum">{comments.length || ""}</span>
      </h2>
      <form onSubmit={submit} className="grid gap-3">
        <Label htmlFor="comment" className="sr-only">
          Add a comment
        </Label>
        <Textarea
          id="comment"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a comment"
          maxLength={4000}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "comment-err" : undefined}
        />
        {error && (
          <p id="comment-err" className="text-footnote text-danger">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Label className="flex min-h-11 items-center gap-2 text-callout text-fg-secondary">
            <Checkbox checked={pinTime} onCheckedChange={(v) => setPinTime(v === true)} />
            Comment at the current moment
          </Label>
          <Button type="submit" loading={pending} disabled={!body.trim()}>
            Post
          </Button>
        </div>
      </form>
      {comments.length === 0 ? (
        <p className="text-callout text-fg-secondary">
          No comments yet. Only people who can see this video can read them.
        </p>
      ) : (
        <ol className="grid gap-4">
          {comments.map((c) => (
            <li key={c.id} className="flex gap-3">
              <span
                aria-hidden
                className="grid size-8 shrink-0 place-items-center rounded-full border border-border bg-raised text-caption font-semibold text-fg-secondary"
              >
                {initials(c.authorName)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2 text-callout">
                  <span className="font-semibold">{c.authorName}</span>
                  {c.atMs !== null && (
                    <button
                      type="button"
                      onClick={() => player?.seek(c.atMs!)}
                      data-inline-target
                      className="inline-flex items-center rounded-sm font-medium text-brand-ink tnum underline-offset-4 hover:underline"
                      aria-label={`Jump to ${formatDuration(c.atMs)}`}
                    >
                      {formatDuration(c.atMs)}
                    </button>
                  )}
                  <span className="text-footnote text-fg-muted">
                    {relativeDate(new Date(c.createdAt))}
                  </span>
                </p>
                <p className="mt-0.5 text-callout break-words whitespace-pre-wrap">{c.body}</p>
                {c.authorId === viewerId && (
                  <button
                    type="button"
                    className="-ml-2 inline-flex min-h-11 items-center rounded-md px-2 text-footnote text-fg-secondary hover:bg-raised hover:text-fg"
                    onClick={() =>
                      start(async () => {
                        const res = await deleteCommentAction(videoId, c.id)
                        if (!res.ok) toast.error(res.message ?? "That didn't work.")
                      })
                    }
                  >
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
