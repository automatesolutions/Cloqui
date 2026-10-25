"use client"

import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Lock } from "lucide-react"
import type { Playback } from "@/server/videos"

type PlayerApi = { currentMs: () => number; seek: (ms: number) => void }
const PlayerContext = createContext<PlayerApi | null>(null)

export function usePlayer() {
  return use(PlayerContext)
}

/** Shares the player's clock with comments and reactions. */
export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLVideoElement | null>(null)
  const api = useMemo<PlayerApi & { ref: typeof ref }>(
    () => ({
      ref,
      currentMs: () => Math.round((ref.current?.currentTime ?? 0) * 1000),
      seek: (ms) => {
        if (!ref.current) return
        ref.current.currentTime = ms / 1000
        void ref.current.play().catch(() => {})
        ref.current.focus()
      },
    }),
    []
  )
  return <PlayerContext value={api}>{children}</PlayerContext>
}

export function Player({
  videoId,
  initial,
  title,
  watermark,
  viewOnly,
}: {
  videoId: string
  initial: Playback
  title: string
  /** Viewer's email, drawn over the video when the owner turned on the watermark. */
  watermark: string | null
  viewOnly: boolean
}) {
  const ctx = use(PlayerContext) as
    (PlayerApi & { ref: React.RefObject<HTMLVideoElement | null> }) | null
  const [pb, setPb] = useState(initial)
  const [ended, setEnded] = useState(false)
  const refreshing = useRef(false)

  const refresh = useCallback(async () => {
    if (refreshing.current) return
    refreshing.current = true
    try {
      const res = await fetch(`/api/videos/${videoId}/playback`, { cache: "no-store" })
      if (res.status === 403) {
        ctx?.ref.current?.pause()
        setEnded(true)
        return
      }
      if (!res.ok) return
      const next = (await res.json()) as Playback
      const v = ctx?.ref.current
      const at = v?.currentTime ?? 0
      const wasPlaying = v ? !v.paused : false
      setPb(next)
      // Keep position and play state across the source swap.
      requestAnimationFrame(() => {
        const el = ctx?.ref.current
        if (!el) return
        el.addEventListener(
          "loadedmetadata",
          () => {
            el.currentTime = at
            if (wasPlaying) void el.play().catch(() => {})
          },
          { once: true }
        )
      })
    } finally {
      refreshing.current = false
    }
  }, [videoId, ctx])

  // Renew a minute before the signed URL expires.
  useEffect(() => {
    const wait = Math.max(10_000, pb.expiresAt - Date.now() - 60_000)
    const t = setTimeout(refresh, wait)
    return () => clearTimeout(t)
  }, [pb.expiresAt, refresh])

  if (ended) {
    return (
      <div className="grid aspect-video place-items-center rounded-lg border border-border bg-raised px-6 text-center">
        <div>
          <Lock aria-hidden className="mx-auto mb-3 size-8 text-fg-secondary" strokeWidth={1.75} />
          <p className="text-headline">Your access to this video ended</p>
          <p className="mt-1 text-callout text-fg-secondary">Ask the owner if you still need it.</p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="relative overflow-hidden rounded-lg border border-border bg-black"
      onContextMenu={viewOnly ? (e) => e.preventDefault() : undefined}
    >
      <video
        key={pb.src}
        ref={ctx?.ref}
        controls
        playsInline
        preload="metadata"
        poster={pb.poster ?? undefined}
        controlsList={viewOnly ? "nodownload noremoteplayback" : undefined}
        aria-label={`Video: ${title}`}
        className="aspect-video w-full bg-black"
        onError={() => void refresh()}
      >
        <source src={pb.src} type={pb.type.split(";")[0]} />
        {pb.captions && (
          <track kind="captions" src={pb.captions} srcLang="en" label="English" default />
        )}
      </video>
      {watermark && (
        <span
          aria-hidden
          className="cloqui-watermark pointer-events-none absolute text-callout font-medium text-white/40 select-none [text-shadow:0_1px_2px_rgb(0_0_0/.6)]"
        >
          {watermark}
        </span>
      )}
    </div>
  )
}
