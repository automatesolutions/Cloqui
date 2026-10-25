import { describe, expect, it } from "vitest"
import { contrastRatio, isHex } from "./contrast"

describe("contrastRatio", () => {
  it("matches the WCAG extremes", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5)
    expect(contrastRatio("#777", "#777")).toBeCloseTo(1, 5)
  })

  it("is the same either way round, and reads short hex", () => {
    expect(contrastRatio("#fff", "#0b7a60")).toBeCloseTo(contrastRatio("#0b7a60", "#ffffff"), 10)
  })

  it("agrees with our documented token pairs", () => {
    // docs/design/contrast.md: light muted text on the page background passes AA.
    expect(contrastRatio("#626d80", "#f6f7fa")).toBeGreaterThanOrEqual(4.5)
    // Dark muted text on raised surfaces passes AA.
    expect(contrastRatio("#8290a6", "#1c2538")).toBeGreaterThanOrEqual(4.5)
  })
})

describe("isHex", () => {
  it("only accepts plain hex colours", () => {
    expect(isHex("#0b7a60")).toBe(true)
    expect(isHex("#fff")).toBe(true)
    expect(isHex("red")).toBe(false)
    expect(isHex("#0b7a60; } body { display:none")).toBe(false)
  })
})
