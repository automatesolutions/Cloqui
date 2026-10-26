import { describe, expect, it } from "vitest"
import { audienceLabel } from "./audience"

const base = {
  viewerIsOwner: true,
  workspaceVisible: false,
  workspaceName: "Acme",
  others: [] as { name: string }[],
}

describe("audienceLabel", () => {
  it("says Only you for an unshared video", () =>
    expect(audienceLabel(base).label).toBe("Only you"))
  it("names the one other person", () =>
    expect(audienceLabel({ ...base, others: [{ name: "Maria Santos" }] }).label).toBe(
      "You and Maria"
    ))
  it("counts people, owner included", () =>
    expect(
      audienceLabel({ ...base, others: [{ name: "A" }, { name: "B" }, { name: "C" }] }).label
    ).toBe("4 people"))
  it("says Anyone with the link when the public link is on, whatever else is set", () => {
    const r = audienceLabel({ ...base, workspaceVisible: true, publicLink: true })
    expect(r).toEqual({ label: "Anyone with the link", scope: "public", people: false })
  })
  it("uses the workspace name, never 'public'", () => {
    const r = audienceLabel({ ...base, workspaceVisible: true })
    expect(r).toEqual({ label: "Everyone in Acme", scope: "workspace", people: false })
  })
})
