import "server-only"
import { and, asc, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm"
import { env } from "@/lib/env"
import type { CurrentUser } from "@/server/auth"
import { audit } from "@/server/audit"
import { assignableRoles, authorize, canManageMember, AccessDeniedError } from "@/server/authz"
import { systemDb, withRls } from "@/server/db"
import {
  auditEvents,
  profiles,
  workspaceInvites,
  workspaceMembers,
  workspaces,
  type WorkspaceRole,
} from "@/server/db/schema"
import { inviteEmail, sendEmail } from "@/server/email"
import { takeToken } from "@/server/rate-limit"
import { hashToken, newToken } from "@/server/tokens"

export class UserFacingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "UserFacingError"
  }
}

const pgCode = (e: unknown): string | undefined => {
  const err = e as { code?: string; cause?: { code?: string } }
  return err?.code ?? err?.cause?.code
}

// ── Reading ─────────────────────────────────────────────────────────────────

export async function listMyWorkspaces(user: CurrentUser) {
  return withRls(user.claims, (tx) =>
    tx
      .select({
        id: workspaces.id,
        name: workspaces.name,
        slug: workspaces.slug,
        role: workspaceMembers.role,
      })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(eq(workspaceMembers.userId, user.id))
      .orderBy(asc(workspaces.name))
  )
}

export async function listMembers(user: CurrentUser, slug: string) {
  const { workspace } = await authorize(user, "members.view", slug)
  return withRls(user.claims, (tx) =>
    tx
      .select({
        userId: workspaceMembers.userId,
        role: workspaceMembers.role,
        joinedAt: workspaceMembers.joinedAt,
        displayName: profiles.displayName,
        email: profiles.email,
      })
      .from(workspaceMembers)
      .innerJoin(profiles, eq(profiles.id, workspaceMembers.userId))
      .where(eq(workspaceMembers.workspaceId, workspace.id))
      .orderBy(asc(profiles.displayName))
  )
}

export async function listOpenInvites(user: CurrentUser, slug: string) {
  const { workspace } = await authorize(user, "members.invite", slug)
  return withRls(user.claims, (tx) =>
    tx
      .select({
        id: workspaceInvites.id,
        email: workspaceInvites.email,
        role: workspaceInvites.role,
        createdAt: workspaceInvites.createdAt,
        expiresAt: workspaceInvites.expiresAt,
      })
      .from(workspaceInvites)
      .where(
        and(
          eq(workspaceInvites.workspaceId, workspace.id),
          isNull(workspaceInvites.acceptedAt),
          isNull(workspaceInvites.revokedAt),
          gt(workspaceInvites.expiresAt, sql`now()`)
        )
      )
      .orderBy(desc(workspaceInvites.createdAt))
  )
}

export async function listAuditEvents(user: CurrentUser, slug: string, limit = 100) {
  const { workspace } = await authorize(user, "audit.view", slug)
  return withRls(user.claims, (tx) =>
    tx
      .select({
        id: auditEvents.id,
        action: auditEvents.action,
        targetType: auditEvents.targetType,
        targetId: auditEvents.targetId,
        metadata: auditEvents.metadata,
        createdAt: auditEvents.createdAt,
        actorName: profiles.displayName,
      })
      .from(auditEvents)
      .leftJoin(profiles, eq(profiles.id, auditEvents.actorId))
      .where(eq(auditEvents.workspaceId, workspace.id))
      .orderBy(desc(auditEvents.createdAt))
      .limit(limit)
  )
}

// ── Creating a workspace ────────────────────────────────────────────────────

export async function createWorkspace(user: CurrentUser, name: string, slug: string) {
  if (!(await takeToken("createWorkspace", user.id))) {
    throw new UserFacingError("You've created a lot of workspaces. Try again in an hour.")
  }
  try {
    await withRls(user.claims, (tx) =>
      tx.execute(sql`select public.create_workspace(${name}, ${slug})`)
    )
    return slug
  } catch (e) {
    if (pgCode(e) === "23505") throw new UserFacingError("That address is taken. Try another one.")
    throw e
  }
}

export async function updateWorkspace(
  user: CurrentUser,
  slug: string,
  patch: { name: string; allowedEmailDomain: string | null }
) {
  const { workspace } = await authorize(user, "workspace.update", slug)
  await withRls(user.claims, async (tx) => {
    await tx.update(workspaces).set(patch).where(eq(workspaces.id, workspace.id))
    await audit(tx, {
      workspaceId: workspace.id,
      actorId: user.id,
      action: "workspace.updated",
      targetType: "workspace",
      targetId: workspace.id,
      metadata: { name: patch.name, allowedEmailDomain: patch.allowedEmailDomain },
    })
  })
}

// ── Invites ─────────────────────────────────────────────────────────────────

export type InviteResult = { sent: string[]; skipped: { email: string; reason: string }[] }

export async function inviteMembers(
  user: CurrentUser,
  slug: string,
  emails: string[],
  role: WorkspaceRole
): Promise<InviteResult> {
  const access = await authorize(user, "members.invite", slug)
  if (!assignableRoles(access.role).includes(role)) throw new AccessDeniedError()
  const { workspace } = access

  const unique = [...new Set(emails.map((e) => e.toLowerCase()))].slice(0, 50)
  const result: InviteResult = { sent: [], skipped: [] }

  // Already members: skip quietly.
  const existing = new Set(
    (
      await withRls(user.claims, (tx) =>
        tx
          .select({ email: sql<string>`lower(${profiles.email})` })
          .from(workspaceMembers)
          .innerJoin(profiles, eq(profiles.id, workspaceMembers.userId))
          .where(eq(workspaceMembers.workspaceId, workspace.id))
      )
    ).map((r) => r.email)
  )

  for (const email of unique) {
    if (existing.has(email)) {
      result.skipped.push({ email, reason: "Already in this workspace" })
      continue
    }
    const domain = workspace.allowedEmailDomain?.toLowerCase()
    if (domain && role !== "guest" && email.split("@")[1] !== domain) {
      result.skipped.push({
        email,
        reason: `Only @${domain} emails can join. Invite them as a guest instead.`,
      })
      continue
    }
    if (!(await takeToken("invite", user.id))) {
      result.skipped.push({ email, reason: "Invite limit reached. Try again in an hour." })
      continue
    }

    const { token, hash } = newToken()
    await withRls(user.claims, async (tx) => {
      // Replace any open invite for this email, so only the newest link works.
      await tx
        .update(workspaceInvites)
        .set({ revokedAt: sql`now()` })
        .where(
          and(
            eq(workspaceInvites.workspaceId, workspace.id),
            eq(workspaceInvites.email, email),
            isNull(workspaceInvites.acceptedAt),
            isNull(workspaceInvites.revokedAt)
          )
        )
      const [inv] = await tx
        .insert(workspaceInvites)
        .values({
          workspaceId: workspace.id,
          email,
          role,
          tokenHash: hash,
          invitedBy: user.id,
          expiresAt: sql`now() + interval '14 days'`,
        })
        .returning({ id: workspaceInvites.id })
      await audit(tx, {
        workspaceId: workspace.id,
        actorId: user.id,
        action: "member.invited",
        targetType: "invite",
        targetId: inv.id,
        metadata: { role },
      })
    })

    try {
      await sendEmail({
        to: email,
        ...inviteEmail({
          inviterName: user.displayName,
          workspaceName: workspace.name,
          url: `${env.NEXT_PUBLIC_APP_URL}/invite/${token}`,
        }),
      })
      result.sent.push(email)
    } catch {
      result.skipped.push({
        email,
        reason: "We saved the invite but couldn't send the email. Try again.",
      })
    }
  }
  return result
}

export async function revokeInvite(user: CurrentUser, slug: string, inviteId: string) {
  const { workspace } = await authorize(user, "members.invite", slug)
  await withRls(user.claims, async (tx) => {
    const rows = await tx
      .update(workspaceInvites)
      .set({ revokedAt: sql`now()` })
      .where(
        and(
          eq(workspaceInvites.id, inviteId),
          eq(workspaceInvites.workspaceId, workspace.id),
          isNull(workspaceInvites.acceptedAt)
        )
      )
      .returning({ id: workspaceInvites.id })
    if (rows.length === 0) throw new AccessDeniedError()
    await audit(tx, {
      workspaceId: workspace.id,
      actorId: user.id,
      action: "member.invite_revoked",
      targetType: "invite",
      targetId: inviteId,
    })
  })
}

/**
 * What the invite page may show before the person joins. The token is the capability, so this
 * reads without RLS, and returns only the workspace name, inviter name, masked email and status.
 */
export async function getInvitePreview(token: string) {
  const rows = await systemDb
    .select({
      email: workspaceInvites.email,
      role: workspaceInvites.role,
      expiresAt: workspaceInvites.expiresAt,
      acceptedAt: workspaceInvites.acceptedAt,
      revokedAt: workspaceInvites.revokedAt,
      workspaceName: workspaces.name,
      workspaceSlug: workspaces.slug,
      inviterName: profiles.displayName,
    })
    .from(workspaceInvites)
    .innerJoin(workspaces, eq(workspaces.id, workspaceInvites.workspaceId))
    .leftJoin(profiles, eq(profiles.id, workspaceInvites.invitedBy))
    .where(eq(workspaceInvites.tokenHash, hashToken(token)))
    .limit(1)
  const inv = rows[0]
  if (!inv) return null
  const status: "open" | "accepted" | "revoked" | "expired" = inv.acceptedAt
    ? "accepted"
    : inv.revokedAt
      ? "revoked"
      : inv.expiresAt < new Date()
        ? "expired"
        : "open"
  return { ...inv, status }
}

export async function acceptInvite(user: CurrentUser, token: string) {
  try {
    await withRls(user.claims, (tx) =>
      tx.execute(sql`select public.accept_invite(${hashToken(token)})`)
    )
  } catch (e) {
    const code = pgCode(e)
    if (code === "P0002")
      throw new UserFacingError("This invite has expired or was already used. Ask for a new one.")
    if (code === "42501") {
      const msg = String((e as Error).message ?? "")
      if (msg.includes("domain"))
        throw new UserFacingError("This workspace only accepts emails from its own domain.")
      throw new UserFacingError(
        "This invite is for a different email. Sign in with the email it was sent to."
      )
    }
    throw e
  }
}

// ── Members ─────────────────────────────────────────────────────────────────

async function targetMember(user: CurrentUser, workspaceId: string, targetId: string) {
  const [row] = await withRls(user.claims, (tx) =>
    tx
      .select({ role: workspaceMembers.role, name: profiles.displayName })
      .from(workspaceMembers)
      .innerJoin(profiles, eq(profiles.id, workspaceMembers.userId))
      .where(
        and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, targetId))
      )
  )
  return row ?? null
}

export async function changeMemberRole(
  user: CurrentUser,
  slug: string,
  targetId: string,
  role: WorkspaceRole
) {
  const access = await authorize(user, "members.changeRole", slug)
  const target = await targetMember(user, access.workspace.id, targetId)
  const current = target?.role
  if (!target || !current || targetId === user.id || !canManageMember(access.role, current, role)) {
    throw new AccessDeniedError()
  }
  await withRls(user.claims, async (tx) => {
    await tx
      .update(workspaceMembers)
      .set({ role })
      .where(
        and(
          eq(workspaceMembers.workspaceId, access.workspace.id),
          eq(workspaceMembers.userId, targetId)
        )
      )
    await audit(tx, {
      workspaceId: access.workspace.id,
      actorId: user.id,
      action: "member.role_changed",
      targetType: "user",
      targetId,
      metadata: { from: current, to: role, name: target.name },
    })
  })
}

export async function removeMember(user: CurrentUser, slug: string, targetId: string) {
  const access = await authorize(user, "members.remove", slug)
  const target = await targetMember(user, access.workspace.id, targetId)
  const current = target?.role
  if (!target || !current || targetId === user.id || !canManageMember(access.role, current, null)) {
    throw new AccessDeniedError()
  }
  await withRls(user.claims, async (tx) => {
    // Audit first: the actor still passes the member check for this workspace.
    await audit(tx, {
      workspaceId: access.workspace.id,
      actorId: user.id,
      action: "member.removed",
      targetType: "user",
      targetId,
      metadata: { role: current, name: target.name },
    })
    await tx
      .delete(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, access.workspace.id),
          eq(workspaceMembers.userId, targetId)
        )
      )
  })
}

/** Lists display names for a set of user ids the person is allowed to see. */
export async function profileNames(user: CurrentUser, ids: string[]) {
  if (ids.length === 0) return new Map<string, string>()
  const rows = await withRls(user.claims, (tx) =>
    tx
      .select({ id: profiles.id, name: profiles.displayName })
      .from(profiles)
      .where(inArray(profiles.id, ids))
  )
  return new Map(rows.map((r) => [r.id, r.name]))
}
