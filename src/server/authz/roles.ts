import type { WorkspaceRole } from "@/server/db/schema"

/** Workspace-level actions. Item-level actions (videos, channels, tasks) arrive in later phases. */
export type WorkspaceAction =
  | "workspace.view"
  | "workspace.update"
  | "workspace.delete"
  | "members.view"
  | "members.invite"
  | "members.changeRole"
  | "members.remove"
  | "audit.view"

const allowed: Record<WorkspaceAction, readonly WorkspaceRole[]> = {
  "workspace.view": ["owner", "admin", "member"],
  "workspace.update": ["owner", "admin"],
  "workspace.delete": ["owner"],
  "members.view": ["owner", "admin", "member"],
  "members.invite": ["owner", "admin"],
  "members.changeRole": ["owner", "admin"],
  "members.remove": ["owner", "admin"],
  "audit.view": ["owner", "admin"],
}

/** Pure role check. Guests never get workspace-level access: only items shared with them. */
export function roleCan(role: WorkspaceRole | null | undefined, action: WorkspaceAction): boolean {
  return !!role && allowed[action].includes(role)
}

/** Which roles an inviter may hand out. Nobody can invite an owner. */
export function assignableRoles(inviter: WorkspaceRole | null | undefined): WorkspaceRole[] {
  if (inviter === "owner" || inviter === "admin") return ["admin", "member", "guest"]
  return []
}

/** Whether `actor` may change `target`'s role to `next`, or remove them (next = null). */
export function canManageMember(
  actor: WorkspaceRole | null | undefined,
  target: WorkspaceRole,
  next: WorkspaceRole | null
): boolean {
  if (actor !== "owner" && actor !== "admin") return false
  if (target === "owner") return false
  if (next === "owner") return false
  return true
}
