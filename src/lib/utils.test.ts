import { describe, expect, it } from "vitest"
import { cn } from "./utils"

describe("cn", () => {
  it("keeps a text colour next to a Cloqui font size", () => {
    expect(cn("text-callout text-on-brand")).toBe("text-on-brand text-callout")
    expect(cn("text-footnote text-fg-secondary")).toBe("text-fg-secondary text-footnote")
  })

  it("still lets a later font size win over an earlier one", () => {
    expect(cn("text-callout", "text-body")).toBe("text-body")
  })
})
