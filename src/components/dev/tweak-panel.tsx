"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { SlidersHorizontal, X } from "lucide-react"
import { contrastRatio, isHex } from "@/lib/contrast"
import {
  CONTRAST_PAIRS,
  RADIUS_RANGE,
  radiusScale,
  TWEAK_COLORS,
  validateTweak,
  type TweakColor,
  type TweakTheme,
  type TweakValues,
} from "@/lib/tweak"

// /tweak: development-only panel. Changes show live (inline CSS variables on <html>);
// "Bake" writes them into globals.css through /api/dev/tweak. Never rendered in production.

function clear() {
  const root = document.documentElement.style
  for (const k of TWEAK_COLORS) root.removeProperty(`--${k}`)
  for (const size of ["sm", "md", "lg", "xl"]) root.removeProperty(`--radius-${size}`)
}

/** The theme's own values, without any live overrides. */
function readCurrent(): TweakValues {
  clear()
  const s = getComputedStyle(document.documentElement)
  const colors = Object.fromEntries(
    TWEAK_COLORS.map((k) => [k, s.getPropertyValue(`--${k}`).trim()])
  ) as Record<TweakColor, string>
  return { colors, radiusMd: parseInt(s.getPropertyValue("--radius-md")) || 10 }
}

function apply(v: TweakValues) {
  const root = document.documentElement.style
  for (const k of TWEAK_COLORS) if (isHex(v.colors[k])) root.setProperty(`--${k}`, v.colors[k])
  for (const [size, px] of Object.entries(radiusScale(v.radiusMd))) root.setProperty(`--radius-${size}`, `${px}px`)
}

export function TweakPanel() {
  const { resolvedTheme } = useTheme()
  const theme: TweakTheme = resolvedTheme === "light" ? "light" : "dark"
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.shiftKey && e.code === "KeyT") setOpen((o) => !o)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-3 left-3 z-[100] grid size-11 place-items-center rounded-full border border-border bg-raised text-fg-secondary shadow-md hover:text-fg"
        aria-label="Open tweak panel (Alt+Shift+T)"
      >
        <SlidersHorizontal aria-hidden className="size-5" strokeWidth={1.75} />
      </button>
    )
  }
  // Keyed by theme: each theme has its own colours, so switching starts from that theme's values.
  return (
    <TweakEditor
      key={theme}
      theme={theme}
      onClose={() => {
        clear()
        setOpen(false)
      }}
    />
  )
}

function TweakEditor({ theme, onClose }: { theme: TweakTheme; onClose: () => void }) {
  const [values, setValues] = useState<TweakValues>(readCurrent)
  const [status, setStatus] = useState<string>()

  useEffect(() => {
    apply(values)
  }, [values])

  const problem = validateTweak(values)
  const set = (k: TweakColor, v: string) => {
    setStatus(undefined)
    setValues({ ...values, colors: { ...values.colors, [k]: v } })
  }

  return (
    <aside
      aria-label="Tweak design tokens"
      className="fixed bottom-3 left-3 z-[100] grid max-h-[80dvh] w-80 gap-4 overflow-y-auto rounded-lg border border-border bg-surface p-4 text-footnote shadow-lg"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-callout font-semibold">Tweak · {theme} theme</h2>
        <button
          type="button"
          onClick={onClose}
          className="grid size-11 place-items-center rounded-md hover:bg-raised"
          aria-label="Close and discard"
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>

      <label className="grid gap-1.5">
        <span>Corner radius (md): {values.radiusMd}px</span>
        <input
          type="range"
          min={RADIUS_RANGE.min}
          max={RADIUS_RANGE.max}
          value={values.radiusMd}
          onChange={(e) => setValues({ ...values, radiusMd: Number(e.target.value) })}
          className="h-11 accent-[var(--accent)]"
        />
      </label>

      <div className="grid gap-2">
        {TWEAK_COLORS.map((k) => (
          <label key={k} className="flex min-h-11 items-center gap-2">
            <input
              type="color"
              value={isHex(values.colors[k]) && values.colors[k].length === 7 ? values.colors[k] : "#000000"}
              onChange={(e) => set(k, e.target.value)}
              className="size-11 shrink-0 cursor-pointer rounded-md border border-border bg-transparent"
            />
            <span className="flex-1 font-mono">--{k}</span>
            <span className="font-mono text-fg-secondary">{values.colors[k]}</span>
          </label>
        ))}
      </div>

      <details>
        <summary className="flex min-h-11 cursor-pointer items-center">Contrast (needs 4.5:1)</summary>
        <ul className="grid gap-1 font-mono">
          {CONTRAST_PAIRS.map(([fg, bg]) => {
            const r = isHex(values.colors[fg]) && isHex(values.colors[bg]) ? contrastRatio(values.colors[fg], values.colors[bg]) : 0
            return (
              <li key={`${fg}-${bg}`} className={r < 4.5 ? "text-danger-ink" : "text-fg-secondary"}>
                {fg} / {bg}: {r.toFixed(2)}
              </li>
            )
          })}
        </ul>
      </details>

      <p role="status" className={problem ? "text-danger-ink" : "text-fg-secondary"}>
        {status ?? problem ?? "Every pair passes. Bake writes these to globals.css."}
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={!!problem}
          onClick={async () => {
            const res = await fetch("/api/dev/tweak", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ theme, values }),
            })
            const json = (await res.json().catch(() => ({}))) as { changed?: boolean; error?: string }
            setStatus(
              res.ok
                ? json.changed
                  ? "Baked. Update the cloqui-design skill to match."
                  : "Nothing changed."
                : (json.error ?? "Bake failed.")
            )
          }}
          className="h-11 flex-1 rounded-md bg-brand font-semibold text-on-brand disabled:opacity-50"
        >
          Bake
        </button>
        <button
          type="button"
          onClick={() => {
            setStatus(undefined)
            setValues(readCurrent())
          }}
          className="h-11 flex-1 rounded-md border border-border hover:bg-raised"
        >
          Reset
        </button>
      </div>
    </aside>
  )
}
