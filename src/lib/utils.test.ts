import { describe, expect, it } from "vitest"
import { cn } from "./utils"

// Class order doesn't matter to the browser (and Prettier re-sorts literals), so compare as sets.
const classes = (s: string) => s.split(" ").sort()

describe("cn", () => {
  it("keeps a text colour next to a Cloqui font size", () => {
    const pairs = [
      ["text-on-brand", "text-callout"],
      ["text-fg-secondary", "text-footnote"],
    ]
    for (const [color, size] of pairs) {
      expect(classes(cn(color, size))).toEqual(classes(`${color} ${size}`))
    }
  })

  it("still lets a later font size win over an earlier one", () => {
    expect(cn("text-callout", "text-body")).toBe("text-body")
  })
})
