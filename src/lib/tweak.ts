// /tweak: the design tokens the dev slider panel can change, the contrast rules they must keep,
// and how "Bake" writes them back into globals.css. Pure functions; the dev route does the file I/O.

import { contrastRatio, isHex } from "./contrast"

export const TWEAK_COLORS = [
  "bg",
  "surface",
  "raised",
  "text",
  "text-secondary",
  "text-muted",
  "accent",
  "on-accent",
  "accent-ink",
] as const

export type TweakColor = (typeof TWEAK_COLORS)[number]
export type TweakTheme = "dark" | "light"
export type TweakValues = { colors: Record<TweakColor, string>; radiusMd: number }

export const RADIUS_RANGE = { min: 0, max: 20 } as const

/** Text-on-background pairs that must stay at 4.5:1 or more (/hig, WCAG AA). */
export const CONTRAST_PAIRS: [fg: TweakColor, bg: TweakColor][] = [
  ["text", "bg"],
  ["text", "surface"],
  ["text", "raised"],
  ["text-secondary", "bg"],
  ["text-secondary", "surface"],
  ["text-secondary", "raised"],
  ["text-muted", "bg"],
  ["text-muted", "surface"],
  ["text-muted", "raised"],
  ["on-accent", "accent"],
  ["accent-ink", "bg"],
  ["accent-ink", "surface"],
]

export function contrastFailures(colors: Record<TweakColor, string>) {
  return CONTRAST_PAIRS.flatMap(([fg, bg]) => {
    const ratio = contrastRatio(colors[fg], colors[bg])
    return ratio < 4.5 ? [{ fg, bg, ratio }] : []
  })
}

export function validateTweak(v: TweakValues): string | null {
  for (const k of TWEAK_COLORS) {
    if (!isHex(v.colors[k] ?? "")) return `--${k} must be a hex colour like #0b7a60`
  }
  if (
    !Number.isInteger(v.radiusMd) ||
    v.radiusMd < RADIUS_RANGE.min ||
    v.radiusMd > RADIUS_RANGE.max
  ) {
    return `Corner radius must be a whole number from ${RADIUS_RANGE.min} to ${RADIUS_RANGE.max}`
  }
  const failed = contrastFailures(v.colors)
  if (failed.length) {
    const f = failed[0]
    return `--${f.fg} on --${f.bg} is ${f.ratio.toFixed(2)}:1. It needs 4.5:1.`
  }
  return null
}

/** The four radii move together around the middle one, like the design system defines them. */
export function radiusScale(md: number) {
  return { sm: Math.max(0, md - 2), md, lg: md + 2, xl: md + 4 }
}

const blockPattern: Record<TweakTheme, RegExp> = {
  dark: /(:root,\s*\.dark\s*\{)([\s\S]*?)(\n\})/,
  light: /(\n\.light\s*\{)([\s\S]*?)(\n\})/,
}

function hexToRgb(hex: string) {
  let h = hex.slice(1)
  if (h.length === 3) h = [...h].map((c) => c + c).join("")
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(" ")
}

/** Returns globals.css with one theme's colours and the shared radii replaced. Throws if invalid. */
export function bakeTokens(css: string, theme: TweakTheme, v: TweakValues): string {
  const problem = validateTweak(v)
  if (problem) throw new Error(problem)

  const block = css.match(blockPattern[theme])
  if (!block) throw new Error(`Couldn't find the ${theme} theme block in globals.css`)
  let body = block[2]
  for (const k of TWEAK_COLORS) {
    body = body.replace(new RegExp(`(\\n\\s*--${k}:\\s*)[^;]+;`), `$1${v.colors[k].toLowerCase()};`)
  }
  // The soft tint follows the accent, keeping its own opacity.
  body = body.replace(
    /(\n\s*--accent-soft:\s*)rgb\([^/]+\/\s*([\d.]+)\);/,
    `$1rgb(${hexToRgb(v.colors.accent)} / $2);`
  )
  let out = css.replace(
    blockPattern[theme],
    (_, open: string, __: string, close: string) => open + body + close
  )

  const r = radiusScale(v.radiusMd)
  for (const [size, px] of Object.entries(r)) {
    out = out.replace(new RegExp(`(\\n\\s*--radius-${size}:\\s*)[^;]+;`), `$1${px}px;`)
  }
  return out
}
