import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { bakeTokens, radiusScale, validateTweak, type TweakValues } from "./tweak"

const css = readFileSync("src/app/globals.css", "utf8")

const dark: TweakValues = {
  radiusMd: 10,
  colors: {
    bg: "#0e1420",
    surface: "#151c2b",
    raised: "#1c2538",
    text: "#e8edf5",
    "text-secondary": "#9aa7bd",
    "text-muted": "#8290a6",
    accent: "#2dd4a8",
    "on-accent": "#04241b",
    "accent-ink": "#2dd4a8",
  },
}

describe("validateTweak", () => {
  it("accepts today's dark theme", () => {
    expect(validateTweak(dark)).toBeNull()
  })

  it("refuses colours that drop below 4.5:1", () => {
    const low = { ...dark, colors: { ...dark.colors, "text-muted": "#3a4866" } }
    expect(validateTweak(low)).toMatch(/--text-muted on --\w+ is [\d.]+:1/)
  })

  it("refuses anything that isn't a plain hex colour (no CSS injection)", () => {
    const bad = { ...dark, colors: { ...dark.colors, accent: "#fff; } body { display: none" } }
    expect(validateTweak(bad)).toMatch(/hex colour/)
  })

  it("refuses radii outside the range", () => {
    expect(validateTweak({ ...dark, radiusMd: 40 })).toMatch(/radius/)
  })
})

describe("bakeTokens", () => {
  it("changes only the chosen theme and the radii", () => {
    const next = {
      ...dark,
      radiusMd: 12,
      colors: { ...dark.colors, accent: "#33ddb0", "accent-ink": "#33ddb0" },
    }
    const out = bakeTokens(css, "dark", next)
    const darkBlock = out.match(/:root,\s*\.dark\s*\{[\s\S]*?\n\}/)![0]
    const lightBlock = out.match(/\n\.light\s*\{[\s\S]*?\n\}/)![0]
    expect(darkBlock).toContain("--accent: #33ddb0;")
    expect(darkBlock).toContain("--accent-soft: rgb(51 221 176 / 0.12);")
    expect(lightBlock).toContain("--accent: #0b7a60;")
    expect(out).toContain("--radius-md: 12px;")
    expect(out).toContain("--radius-xl: 16px;")
  })

  it("leaves the file as it was when nothing changed", () => {
    expect(bakeTokens(css, "dark", dark)).toBe(css)
  })

  it("throws instead of writing invalid values", () => {
    expect(() => bakeTokens(css, "dark", { ...dark, radiusMd: -1 })).toThrow()
  })
})

describe("radiusScale", () => {
  it("keeps sm at zero or more", () => {
    expect(radiusScale(1)).toEqual({ sm: 0, md: 1, lg: 3, xl: 5 })
  })
})
