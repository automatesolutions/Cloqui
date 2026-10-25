import { describe, expect, it } from "vitest"
import { formatDuration, relativeDate } from "./format"

describe("formatDuration", () => {
  it.each([
    [0, "0:00"],
    [65_000, "1:05"],
    [3_725_000, "1:02:05"],
  ])("%i ms → %s", (ms, out) => expect(formatDuration(ms)).toBe(out))
})

describe("relativeDate", () => {
  const now = new Date("2026-10-26T12:00:00Z")
  it("reads naturally", () => {
    expect(relativeDate(new Date("2026-10-26T11:59:30Z"), now)).toBe("just now")
    expect(relativeDate(new Date("2026-10-26T11:59:00Z"), now)).toBe("1 minute ago")
    expect(relativeDate(new Date("2026-10-26T09:00:00Z"), now)).toBe("3 hours ago")
    expect(relativeDate(new Date("2026-10-25T10:00:00Z"), now)).toBe("yesterday")
    expect(relativeDate(new Date("2026-10-01T10:00:00Z"), now)).toBe("Oct 1")
  })
})
