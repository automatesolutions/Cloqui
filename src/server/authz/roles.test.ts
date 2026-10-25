import { describe, expect, it } from "vitest"
import { assignableRoles, canManageMember, roleCan } from "./roles"

describe("roleCan", () => {
  it("never gives guests or strangers workspace access", () => {
    for (const action of ["workspace.view", "members.view", "audit.view"] as const) {
      expect(roleCan("guest", action)).toBe(false)
      expect(roleCan(null, action)).toBe(false)
    }
  })
  it("only owners delete workspaces", () => {
    expect(roleCan("owner", "workspace.delete")).toBe(true)
    expect(roleCan("admin", "workspace.delete")).toBe(false)
  })
  it("members can view but not manage", () => {
    expect(roleCan("member", "members.view")).toBe(true)
    expect(roleCan("member", "members.invite")).toBe(false)
  })
})

describe("member management", () => {
  it("nobody can invite or promote an owner", () => {
    expect(assignableRoles("owner")).not.toContain("owner")
    expect(canManageMember("owner", "member", "owner")).toBe(false)
  })
  it("owners can't be changed or removed by anyone", () => {
    expect(canManageMember("admin", "owner", "member")).toBe(false)
    expect(canManageMember("owner", "owner", null)).toBe(false)
  })
  it("members can't manage anyone", () => {
    expect(canManageMember("member", "guest", null)).toBe(false)
    expect(assignableRoles("member")).toEqual([])
  })
})
