import "server-only"
import type { Tx } from "@/server/db"
import { auditEvents } from "@/server/db/schema"

export type AuditAction =
  | "workspace.created"
  | "workspace.updated"
  | "member.invited"
  | "member.invite_revoked"
  | "member.joined"
  | "member.role_changed"
  | "member.removed"
  | "member.left"
  | "workspace.exported"
  | "security.2fa_required"
  | "security.2fa_optional"
  | "security.retention_changed"
  | "security.public_links_allowed"
  | "security.public_links_blocked"

/** Append an audit event inside the caller's RLS transaction (actor must be the signed-in person). */
export async function audit(
  tx: Tx,
  e: {
    workspaceId: string
    actorId: string
    action: AuditAction
    targetType?: string
    targetId?: string
    metadata?: Record<string, unknown>
  }
) {
  await tx.insert(auditEvents).values({
    workspaceId: e.workspaceId,
    actorId: e.actorId,
    action: e.action,
    targetType: e.targetType,
    targetId: e.targetId,
    metadata: e.metadata ?? {},
  })
}
