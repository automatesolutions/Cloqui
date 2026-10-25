import "server-only"
import { cache } from "react"
import { and, eq } from "drizzle-orm"
import type { CurrentUser } from "@/server/auth"
import { withRls } from "@/server/db"
import { workspaceMembers, workspaces, type WorkspaceRole } from "@/server/db/schema"
import { roleCan, type WorkspaceAction } from "./roles"

export { roleCan, assignableRoles, canManageMember, type WorkspaceAction } from "./roles"

export type WorkspaceAccess = {
  workspace: { id: string; name: string; slug: string; allowedEmailDomain: string | null }
  role: WorkspaceRole
}

/**
 * The person's membership in a workspace, looked up under RLS.
 * Returns null when they aren't a member. A guest gets null too, because
 * guests have no workspace-level access.
 */
export const getWorkspaceAccess = cache(
  async (user: CurrentUser, slug: string): Promise<WorkspaceAccess | null> => {
    const rows = await withRls(user.claims, (tx) =>
      tx
        .select({
          id: workspaces.id,
          name: workspaces.name,
          slug: workspaces.slug,
          allowedEmailDomain: workspaces.allowedEmailDomain,
          role: workspaceMembers.role,
        })
        .from(workspaces)
        .innerJoin(
          workspaceMembers,
          and(eq(workspaceMembers.workspaceId, workspaces.id), eq(workspaceMembers.userId, user.id))
        )
        .where(eq(workspaces.slug, slug.toLowerCase()))
        .limit(1)
    )
    const row = rows[0]
    if (!row) return null
    const { role, ...workspace } = row
    return { workspace, role }
  }
)

/** can(): the single entry point for workspace permission checks. */
export async function can(
  user: CurrentUser,
  action: WorkspaceAction,
  slug: string
): Promise<WorkspaceAccess | null> {
  const access = await getWorkspaceAccess(user, slug)
  return access && roleCan(access.role, action) ? access : null
}

export class AccessDeniedError extends Error {
  constructor() {
    super("You don't have access to this")
    this.name = "AccessDeniedError"
  }
}

/** For server actions: returns the access or throws. */
export async function authorize(user: CurrentUser, action: WorkspaceAction, slug: string) {
  const access = await can(user, action, slug)
  if (!access) throw new AccessDeniedError()
  return access
}
