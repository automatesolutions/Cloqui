import "server-only"
import { and, eq, sql } from "drizzle-orm"
import { env } from "@/lib/env"
import type { CurrentUser } from "@/server/auth"
import { AccessDeniedError } from "@/server/authz"
import { postMessage } from "@/server/chat"
import { systemDb, withRls } from "@/server/db"
import {
  chatChannels,
  notifications,
  profiles,
  taskAssignees,
  taskAutomations,
  taskLists,
  taskSpaces,
  taskStatuses,
  workspaces,
} from "@/server/db/schema"
import { takeToken } from "@/server/rate-limit"
import { UserFacingError } from "@/server/workspaces"

// "When a task moves to <status>, do <action>." One trigger, three actions, on purpose.

export type AutomationAction = "notify_assignees" | "notify_user" | "post_channel"

export type AutomationRow = {
  id: string
  statusId: string
  statusName: string
  action: AutomationAction
  targetName: string | null
}

async function canReadList(user: CurrentUser, listId: string) {
  const [r] = await withRls(user.claims, (tx) =>
    tx.execute<{ ok: boolean }>(sql`select public.can_read_space(public.list_space(${listId}::uuid)) as ok`)
  )
  return r?.ok === true
}

export async function listAutomations(user: CurrentUser, listId: string): Promise<AutomationRow[]> {
  if (!(await canReadList(user, listId))) throw new AccessDeniedError()
  const rows = await withRls(user.claims, (tx) =>
    tx
      .select({
        id: taskAutomations.id,
        statusId: taskAutomations.statusId,
        statusName: taskStatuses.name,
        action: taskAutomations.action,
        userName: profiles.displayName,
        channelName: chatChannels.name,
      })
      .from(taskAutomations)
      .innerJoin(taskStatuses, eq(taskStatuses.id, taskAutomations.statusId))
      .leftJoin(profiles, eq(profiles.id, taskAutomations.targetUserId))
      // Under RLS: a channel the viewer can't read shows up without its name.
      .leftJoin(chatChannels, eq(chatChannels.id, taskAutomations.targetChannelId))
      .where(eq(taskAutomations.listId, listId))
      .orderBy(taskStatuses.position, taskAutomations.createdAt)
  )
  return rows.map((r) => ({
    id: r.id,
    statusId: r.statusId,
    statusName: r.statusName,
    action: r.action,
    targetName: r.action === "notify_user" ? r.userName : r.action === "post_channel" ? (r.channelName ? `#${r.channelName}` : "a private channel") : null,
  }))
}

export async function createAutomation(
  user: CurrentUser,
  listId: string,
  input: { statusId: string; action: AutomationAction; targetUserId?: string; targetChannelId?: string }
) {
  if (!(await canReadList(user, listId))) throw new AccessDeniedError()
  if (!(await takeToken("taskWrite", user.id))) {
    throw new UserFacingError("You're making changes very fast. Wait a moment and try again.")
  }
  try {
    await withRls(user.claims, (tx) =>
      tx.insert(taskAutomations).values({
        listId,
        statusId: input.statusId,
        action: input.action,
        targetUserId: input.action === "notify_user" ? input.targetUserId : null,
        targetChannelId: input.action === "post_channel" ? input.targetChannelId : null,
        createdBy: user.id,
      })
    )
  } catch (e) {
    // RLS refuses a person or channel that can't see this list, or a status from another list.
    if ((e as { cause?: { code?: string } })?.cause?.code === "42501") {
      throw new UserFacingError(
        input.action === "notify_user"
          ? "That person can't see this list, so they can't be notified about it."
          : "Choose a status from this list, and a channel you're in."
      )
    }
    throw e
  }
}

export async function deleteAutomation(user: CurrentUser, automationId: string) {
  const res = await withRls(user.claims, (tx) =>
    tx.delete(taskAutomations).where(eq(taskAutomations.id, automationId)).returning({ id: taskAutomations.id })
  )
  if (!res.length) throw new AccessDeniedError()
}

/**
 * Runs after a task's status changes. Best effort: an automation that fails never blocks the move.
 * Notified people are re-checked against the space, since access can change after setup.
 */
export async function runAutomations(
  actor: CurrentUser,
  task: { id: string; listId: string; title: string },
  statusId: string
) {
  try {
    const rules = await systemDb
      .select()
      .from(taskAutomations)
      .where(and(eq(taskAutomations.listId, task.listId), eq(taskAutomations.statusId, statusId)))
    if (!rules.length) return
    const [ctx] = await systemDb
      .select({ workspaceId: taskSpaces.workspaceId, slug: workspaces.slug, spaceId: taskSpaces.id, statusName: taskStatuses.name })
      .from(taskLists)
      .innerJoin(taskSpaces, eq(taskSpaces.id, taskLists.spaceId))
      .innerJoin(workspaces, eq(workspaces.id, taskSpaces.workspaceId))
      .innerJoin(taskStatuses, eq(taskStatuses.id, statusId))
      .where(eq(taskLists.id, task.listId))
    if (!ctx) return

    const recipients = new Set<string>()
    for (const r of rules) {
      if (r.action === "notify_user" && r.targetUserId) recipients.add(r.targetUserId)
      if (r.action === "notify_assignees") {
        const a = await systemDb.select({ id: taskAssignees.userId }).from(taskAssignees).where(eq(taskAssignees.taskId, task.id))
        for (const x of a) recipients.add(x.id)
      }
    }
    recipients.delete(actor.id)
    if (recipients.size) {
      const ids = [...recipients]
      const allowed = await systemDb.execute<{ id: string }>(
        sql`select u.id from unnest(${`{${ids.join(",")}}`}::uuid[]) as u(id) where public.user_can_read_space(${ctx.spaceId}::uuid, u.id)`
      )
      if (allowed.length) {
        await systemDb.insert(notifications).values(
          allowed.map((u) => ({
            userId: u.id,
            workspaceId: ctx.workspaceId,
            kind: "task_status",
            actorId: actor.id,
            targetType: "task",
            targetId: task.id,
            preview: `${task.title.slice(0, 100)} → ${ctx.statusName}`,
          }))
        )
      }
    }

    // A channel can hold people who can't see this list, so the post never includes the title:
    // only a link, which opens for people who can see the task.
    const channels = rules.filter((r) => r.action === "post_channel" && r.targetChannelId).map((r) => r.targetChannelId!)
    const link = `${env.NEXT_PUBLIC_APP_URL}/w/${ctx.slug}/tasks/${task.listId}?task=${task.id}`
    for (const channelId of new Set(channels)) {
      await postMessage(actor, channelId, { body: `Moved a task to ${ctx.statusName}: ${link}` }).catch(() => {})
    }
  } catch (e) {
    console.error("automation failed", (e as Error)?.name)
  }
}


/** Channels this person can post a task link to: ones they can read in the list's workspace. */
export async function listPostableChannels(user: CurrentUser, listId: string) {
  const [ctx] = await systemDb
    .select({ workspaceId: taskSpaces.workspaceId })
    .from(taskLists)
    .innerJoin(taskSpaces, eq(taskSpaces.id, taskLists.spaceId))
    .where(eq(taskLists.id, listId))
  if (!ctx) return []
  return withRls(user.claims, (tx) =>
    tx
      .select({ id: chatChannels.id, name: chatChannels.name })
      .from(chatChannels)
      .where(and(eq(chatChannels.workspaceId, ctx.workspaceId), eq(chatChannels.kind, "channel"), sql`${chatChannels.archivedAt} is null`))
      .orderBy(chatChannels.name)
  )
}
