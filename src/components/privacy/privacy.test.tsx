import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { AccessChip } from "./access-chip"
import { RecordingPill, formatElapsed } from "./recording-pill"

describe("AccessChip", () => {
  it("names the audience for screen readers, not only with an icon", () => {
    render(<AccessChip label="4 people" people />)
    expect(screen.getByText("Who can see this:", { exact: false })).toBeInTheDocument()
    expect(screen.getByText("4 people")).toBeInTheDocument()
  })
})

describe("RecordingPill", () => {
  it("always says it is recording in words", () => {
    render(<RecordingPill elapsedSeconds={65} />)
    expect(screen.getByRole("status")).toHaveTextContent("You are recording")
    expect(screen.getByRole("status")).toHaveTextContent("01:05")
  })

  it("says Paused when paused", () => {
    render(<RecordingPill paused elapsedSeconds={3} />)
    expect(screen.getByRole("status")).toHaveTextContent("Paused")
  })
})

describe("formatElapsed", () => {
  it.each([
    [0, "00:00"],
    [59, "00:59"],
    [600, "10:00"],
    [3725, "1:02:05"],
    [-4, "00:00"],
  ])("%i s → %s", (s, out) => expect(formatElapsed(s)).toBe(out))
})
