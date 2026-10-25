import "server-only"
import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm"
import type { CurrentUser } from "@/server/auth"
import { AccessDeniedError, authorize } from "@/server/authz"
import { systemDb, withRls, type Tx } from "@/server/db"
import {
  chatChannels,
  chatMessages,
  notifications,
  profiles,
  taskActivity,
  taskAssignees,
  taskAttachments,
  taskChecklistItems,
  taskComments,
  taskLabelLinks,
  taskLabels,
  taskLists,
  taskSavedViews,
  taskSpaceMembers,
  taskSpaces,
  taskStatuses,
  tasks,
  videos,
  workspaceMembers,
  workspaces,
  type TaskFilters,
  type TaskPriority,
} from "@/server/db/schema"
import { presignRead, presignUpload } from "@/server/media/storage"
import { takeToken } from "@/server/rate-limit"
import { getVideoRole } from "@/server/videos"
import { UserFacingError } from "@/server/workspaces"

const pgCode = (e: unknown) =>
  (e as { code?: string; cause?: { code?: string } })?.code ??
  (e as { cause?: { code?: string } })?.cause?.code

async function namesFor(ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))]
  if (!unique.length) return new Map<string, string>()
  const rows = await systemDb
    .select({ id: profiles.id, name: profiles.displayName })
    .from(profiles)
    .where(inArray(profiles.id, unique))
  return new Map(rows.map((r) => [r.id, r.name]))
}

async function canReadTask(user: CurrentUser, taskId: string) {
  const [r] = await withRls(user.claims, (tx) =>
    tx.execute<{ ok: boolean }>(sql`select public.can_read_task(${taskId}::uuid) as ok`)
  )
  return r?.ok === true
}

async function requireTask(user: CurrentUser, taskId: string) {
  if (!(await canReadTask(user, taskId))) throw new AccessDeniedError()
  const [t] = await withRls(user.claims, (tx) =>
    tx.select().from(tasks).where(eq(tasks.id, taskId))
  )
  if (!t) throw new AccessDeniedError()
  return t
}

async function logActivity(
  tx: Tx,
  taskId: string,
  actorId: string,
  action: string,
  metadata: Record<string, unknown> = {}
) {
  await tx.insert(taskActivity).values({ taskId, actorId, action, metadata })
}

async function workspaceOfList(listId: string) {
  const [r] = await systemDb
    .select({ workspaceId: taskSpaces.workspaceId, slug: workspaces.slug, spaceId: taskSpaces.id })
    .from(taskLists)
    .innerJoin(taskSpaces, eq(taskSpaces.id, taskLists.spaceId))
    .innerJoin(workspaces, eq(workspaces.id, taskSpaces.workspaceId))
    .where(eq(taskLists.id, listId))
  return r
}

async function notify(
  recipients: string[],
  actor: CurrentUser,
  workspaceId: string,
  kind: "task_assigned" | "task_mention" | "task_due_soon" | "task_overdue",
  taskId: string,
  preview: string
) {
  const unique = [...new Set(recipients)].filter((id) => id !== actor.id)
  if (!unique.length) return
  await systemDb
    .insert(notifications)
    .values(
      unique.map((userId) => ({
        userId,
        workspaceId,
        kind,
        actorId: actor.id,
        targetType: "task",
        targetId: taskId,
        preview: preview.slice(0, 140),
      }))
    )
}

/** Keep only people who can see this space. */
async function readersOf(spaceId: string, userIds: string[]) {
  if (!userIds.length) return []
  const rows = await systemDb.execute<{ id: string }>(
    sql`select u.id from unnest(${`{${userIds.join(",")}}`}::uuid[]) as u(id) where public.user_can_read_space(${spaceId}::uuid, u.id)`
  )
  return rows.map((r) => r.id)
}

// ── Spaces and lists ────────────────────────────────────────────────────────

export async function listTaskTree(user: CurrentUser, slug: string) {
  const { workspace } = await authorize(user, "workspace.view", slug)
  const [spaces, lists] = await withRls(user.claims, async (tx) => [
    await tx
      .select({ id: taskSpaces.id, name: taskSpaces.name, isPrivate: taskSpaces.isPrivate })
      .from(taskSpaces)
      .where(and(eq(taskSpaces.workspaceId, workspace.id), isNull(taskSpaces.archivedAt)))
      .orderBy(asc(taskSpaces.name)),
    await tx
      .select({ id: taskLists.id, spaceId: taskLists.spaceId, name: taskLists.name })
      .from(taskLists)
      .innerJoin(taskSpaces, eq(taskSpaces.id, taskLists.spaceId))
      .where(and(eq(taskSpaces.workspaceId, workspace.id), isNull(taskLists.archivedAt)))
      .orderBy(asc(taskLists.position), asc(taskLists.createdAt)),
  ])
  return spaces.map((s) => ({ ...s, lists: lists.filter((l) => l.spaceId === s.id) }))
}

export async function createSpace(
  user: CurrentUser,
  slug: string,
  input: { name: string; isPrivate: boolean; memberIds: string[] }
) {
  const { workspace } = await authorize(user, "workspace.view", slug)
  // Id made here: a private space isn't readable until its creator is a member (RLS on RETURNING).
  const id = crypto.randomUUID()
  try {
    await withRls(user.claims, async (tx) => {
      await tx
        .insert(taskSpaces)
        .values({
          id,
          workspaceId: workspace.id,
          name: input.name,
          isPrivate: input.isPrivate,
          createdBy: user.id,
        })
      await tx.insert(taskSpaceMembers).values({ spaceId: id, userId: user.id, role: "admin" })
      const others = [...new Set(input.memberIds)].filter((u) => u !== user.id)
      if (others.length)
        await tx.insert(taskSpaceMembers).values(others.map((userId) => ({ spaceId: id, userId })))
    })
  } catch (e) {
    if (pgCode(e) === "42501")
      throw new UserFacingError("Some of those people aren't in this workspace.")
    throw e
  }
  return id
}

export async function createList(
  user: CurrentUser,
  spaceId: string,
  input: { name: string; channelId?: string | null }
) {
  const id = crypto.randomUUID()
  try {
    await withRls(user.claims, (tx) =>
      tx
        .insert(taskLists)
        .values({
          id,
          spaceId,
          name: input.name,
          channelId: input.channelId ?? null,
          createdBy: user.id,
          position: Date.now(),
        })
    )
  } catch (e) {
    if (pgCode(e) === "42501") throw new AccessDeniedError()
    throw e
  }
  return id
}

export type ListView = {
  list: typeof taskLists.$inferSelect
  space: { id: string; name: string; isPrivate: boolean }
  statuses: (typeof taskStatuses.$inferSelect)[]
  labels: (typeof taskLabels.$inferSelect)[]
  people: { id: string; name: string; email: string }[]
  channel: { id: string; name: string } | null
}

export async function getListView(user: CurrentUser, listId: string): Promise<ListView | null> {
  return withRls(user.claims, async (tx) => {
    const [list] = await tx.select().from(taskLists).where(eq(taskLists.id, listId))
    if (!list) return null
    const [space] = await tx
      .select({
        id: taskSpaces.id,
        name: taskSpaces.name,
        isPrivate: taskSpaces.isPrivate,
        workspaceId: taskSpaces.workspaceId,
      })
      .from(taskSpaces)
      .where(eq(taskSpaces.id, list.spaceId))
    const statuses = await tx
      .select()
      .from(taskStatuses)
      .where(eq(taskStatuses.listId, listId))
      .orderBy(asc(taskStatuses.position))
    const labels = await tx
      .select()
      .from(taskLabels)
      .where(eq(taskLabels.spaceId, list.spaceId))
      .orderBy(asc(taskLabels.name))
    // People who can be assigned: everyone who can see this space.
    const candidates = space.isPrivate
      ? (
          await tx
            .select({ id: taskSpaceMembers.userId })
            .from(taskSpaceMembers)
            .where(eq(taskSpaceMembers.spaceId, space.id))
        ).map((r) => r.id)
      : (
          await systemDb
            .select({ id: workspaceMembers.userId })
            .from(workspaceMembers)
            .where(
              and(
                eq(workspaceMembers.workspaceId, space.workspaceId),
                ne(workspaceMembers.role, "guest")
              )
            )
        ).map((r) => r.id)
    const people = candidates.length
      ? await systemDb
          .select({ id: profiles.id, name: profiles.displayName, email: profiles.email })
          .from(profiles)
          .where(inArray(profiles.id, candidates))
          .orderBy(asc(profiles.displayName))
      : []
    let channel: ListView["channel"] = null
    if (list.channelId) {
      const [c] = await tx
        .select({ id: chatChannels.id, name: chatChannels.name })
        .from(chatChannels)
        .where(eq(chatChannels.id, list.channelId))
      if (c) channel = { id: c.id, name: c.name ?? "" }
    }
    return {
      list,
      space: { id: space.id, name: space.name, isPrivate: space.isPrivate },
      statuses,
      labels,
      people,
      channel,
    }
  })
}

// ── Tasks ───────────────────────────────────────────────────────────────────

export type TaskRow = {
  id: string
  title: string
  statusId: string
  priority: TaskPriority
  startDate: string | null
  dueDate: string | null
  position: number
  completedAt: Date | null
  assignees: { id: string; name: string }[]
  labels: { id: string; name: string; tone: string }[]
  subtaskCount: number
  subtasksDone: number
  checklistTotal: number
  checklistDone: number
  commentCount: number
  hasVideo: boolean
}

export async function listTasks(
  user: CurrentUser,
  listId: string,
  filters: TaskFilters = {}
): Promise<TaskRow[]> {
  const rows = await withRls(user.claims, (tx) =>
    tx
      .select({
        id: tasks.id,
        title: tasks.title,
        statusId: tasks.statusId,
        priority: tasks.priority,
        startDate: tasks.startDate,
        dueDate: tasks.dueDate,
        position: tasks.position,
        completedAt: tasks.completedAt,
        videoId: tasks.videoId,
        kind: taskStatuses.kind,
        subtaskCount: sql<number>`(select count(*)::int from public.tasks s where s.parent_id = ${tasks.id} and s.archived_at is null)`,
        subtasksDone: sql<number>`(select count(*)::int from public.tasks s where s.parent_id = ${tasks.id} and s.archived_at is null and s.completed_at is not null)`,
        checklistTotal: sql<number>`(select count(*)::int from public.task_checklist_items c where c.task_id = ${tasks.id})`,
        checklistDone: sql<number>`(select count(*)::int from public.task_checklist_items c where c.task_id = ${tasks.id} and c.done)`,
        commentCount: sql<number>`(select count(*)::int from public.task_comments c where c.task_id = ${tasks.id} and c.deleted_at is null)`,
      })
      .from(tasks)
      .innerJoin(taskStatuses, eq(taskStatuses.id, tasks.statusId))
      .where(
        and(
          eq(tasks.listId, listId),
          isNull(tasks.parentId),
          isNull(tasks.archivedAt),
          filters.priority?.length ? inArray(tasks.priority, filters.priority) : undefined,
          filters.status ? eq(taskStatuses.kind, filters.status) : undefined,
          filters.q
            ? sql`${tasks.title} ilike ${`%${filters.q.replace(/[%_]/g, "")}%`}`
            : undefined,
          filters.assignee
            ? sql`exists (select 1 from public.task_assignees a where a.task_id = ${tasks.id} and a.user_id = ${filters.assignee === "me" ? user.id : filters.assignee}::uuid)`
            : undefined,
          filters.labelId
            ? sql`exists (select 1 from public.task_label_links l where l.task_id = ${tasks.id} and l.label_id = ${filters.labelId}::uuid)`
            : undefined
        )
      )
      .orderBy(asc(tasks.position), asc(tasks.createdAt))
  )
  return hydrateRows(user, rows)
}

async function hydrateRows<T extends { id: string; videoId: string | null }>(
  user: CurrentUser,
  rows: T[]
) {
  const ids = rows.map((r) => r.id)
  const [assignees, labels] = ids.length
    ? await withRls(user.claims, async (tx) => [
        await tx
          .select({ taskId: taskAssignees.taskId, userId: taskAssignees.userId })
          .from(taskAssignees)
          .where(inArray(taskAssignees.taskId, ids)),
        await tx
          .select({
            taskId: taskLabelLinks.taskId,
            id: taskLabels.id,
            name: taskLabels.name,
            tone: taskLabels.tone,
          })
          .from(taskLabelLinks)
          .innerJoin(taskLabels, eq(taskLabels.id, taskLabelLinks.labelId))
          .where(inArray(taskLabelLinks.taskId, ids)),
      ])
    : [[], []]
  const names = await namesFor(assignees.map((a) => a.userId))
  return rows.map(({ videoId, ...r }) => ({
    ...(r as Omit<T, "videoId">),
    hasVideo: !!videoId,
    assignees: assignees
      .filter((a) => a.taskId === r.id)
      .map((a) => ({ id: a.userId, name: names.get(a.userId) ?? "Someone" })),
    labels: labels
      .filter((l) => l.taskId === r.id)
      .map(({ id, name, tone }) => ({ id, name, tone })),
  })) as unknown as TaskRow[]
}

/** Open tasks assigned to me across the workspace, soonest due first. */
export async function myTasks(user: CurrentUser, slug: string, limit = 50) {
  const { workspace } = await authorize(user, "workspace.view", slug)
  return withRls(user.claims, (tx) =>
    tx
      .select({
        id: tasks.id,
        title: tasks.title,
        dueDate: tasks.dueDate,
        priority: tasks.priority,
        listId: tasks.listId,
        listName: taskLists.name,
        statusName: taskStatuses.name,
      })
      .from(tasks)
      .innerJoin(
        taskAssignees,
        and(eq(taskAssignees.taskId, tasks.id), eq(taskAssignees.userId, user.id))
      )
      .innerJoin(taskLists, eq(taskLists.id, tasks.listId))
      .innerJoin(taskSpaces, eq(taskSpaces.id, taskLists.spaceId))
      .innerJoin(taskStatuses, eq(taskStatuses.id, tasks.statusId))
      .where(
        and(
          eq(taskSpaces.workspaceId, workspace.id),
          isNull(tasks.completedAt),
          isNull(tasks.archivedAt)
        )
      )
      .orderBy(sql`${tasks.dueDate} asc nulls last`, desc(tasks.createdAt))
      .limit(limit)
  )
}

export async function createTask(
  user: CurrentUser,
  listId: string,
  input: {
    title: string
    statusId?: string
    parentId?: string | null
    assigneeIds?: string[]
    dueDate?: string | null
    priority?: TaskPriority
    description?: Record<string, unknown> | null
    videoId?: string | null
    sourceMessageId?: string | null
    channelId?: string | null
  }
) {
  if (!(await takeToken("taskWrite", user.id)))
    throw new UserFacingError("You're creating tasks very fast. Wait a moment.")
  const ws = await workspaceOfList(listId)
  if (!ws) throw new AccessDeniedError()
  const id = crypto.randomUUID()
  try {
    await withRls(user.claims, async (tx) => {
      let statusId = input.statusId
      if (!statusId) {
        const [first] = await tx
          .select({ id: taskStatuses.id })
          .from(taskStatuses)
          .where(eq(taskStatuses.listId, listId))
          .orderBy(asc(taskStatuses.position))
          .limit(1)
        if (!first) throw new AccessDeniedError()
        statusId = first.id
      }
      await tx.insert(tasks).values({
        id,
        listId,
        statusId,
        parentId: input.parentId ?? null,
        title: input.title,
        description: input.description ?? null,
        priority: input.priority ?? "none",
        dueDate: input.dueDate ?? null,
        videoId: input.videoId ?? null,
        sourceMessageId: input.sourceMessageId ?? null,
        channelId: input.channelId ?? null,
        createdBy: user.id,
        position: Date.now(),
      })
      await logActivity(
        tx,
        id,
        user.id,
        "created",
        input.parentId ? { subtaskOf: input.parentId } : {}
      )
    })
  } catch (e) {
    if (pgCode(e) === "42501") throw new AccessDeniedError()
    if (pgCode(e) === "23514")
      throw new UserFacingError("That status or parent task doesn't belong to this list.")
    throw e
  }
  if (input.assigneeIds?.length) await setAssignees(user, id, input.assigneeIds)
  return id
}

type TaskPatch = Partial<{
  title: string
  description: Record<string, unknown> | null
  statusId: string
  priority: TaskPriority
  startDate: string | null
  dueDate: string | null
  estimateMinutes: number | null
  channelId: string | null
}>

export async function updateTask(user: CurrentUser, taskId: string, patch: TaskPatch) {
  const before = await requireTask(user, taskId)
  if (patch.channelId) {
    const [ok] = await withRls(user.claims, (tx) =>
      tx.execute<{ ok: boolean }>(
        sql`select public.can_read_channel(${patch.channelId}::uuid) as ok`
      )
    )
    if (!ok?.ok) throw new AccessDeniedError()
  }
  const set: Record<string, unknown> = { ...patch }
  if ("dueDate" in patch && patch.dueDate !== before.dueDate) {
    set.dueSoonNotifiedAt = null
    set.overdueNotifiedAt = null
  }
  try {
    await withRls(user.claims, async (tx) => {
      await tx.update(tasks).set(set).where(eq(tasks.id, taskId))
      for (const [field, value] of Object.entries(patch)) {
        if (field === "description") {
          await logActivity(tx, taskId, user.id, "edited_description")
          continue
        }
        const old = before[field as keyof typeof before]
        if (old === value) continue
        if (field === "statusId") {
          const [st] = await tx
            .select({ name: taskStatuses.name })
            .from(taskStatuses)
            .where(eq(taskStatuses.id, value as string))
          await logActivity(tx, taskId, user.id, "status", { to: st?.name })
        } else {
          await logActivity(tx, taskId, user.id, field, { to: value })
        }
      }
    })
  } catch (e) {
    if (pgCode(e) === "23514")
      throw new UserFacingError("Check the dates: the start can't be after the due date.")
    throw e
  }
}

/** Board drag and drop: change status and place between neighbours. */
export async function moveTask(
  user: CurrentUser,
  taskId: string,
  statusId: string,
  position: number
) {
  const before = await requireTask(user, taskId)
  await withRls(user.claims, async (tx) => {
    await tx.update(tasks).set({ statusId, position }).where(eq(tasks.id, taskId))
    if (statusId !== before.statusId) {
      const [st] = await tx
        .select({ name: taskStatuses.name })
        .from(taskStatuses)
        .where(eq(taskStatuses.id, statusId))
      await logActivity(tx, taskId, user.id, "status", { to: st?.name })
    }
  })
}

export async function setAssignees(user: CurrentUser, taskId: string, userIds: string[]) {
  const task = await requireTask(user, taskId)
  const ws = await workspaceOfList(task.listId)
  const allowed = await readersOf(ws.spaceId, [...new Set(userIds)])
  const added = await withRls(user.claims, async (tx) => {
    const current = (
      await tx
        .select({ id: taskAssignees.userId })
        .from(taskAssignees)
        .where(eq(taskAssignees.taskId, taskId))
    ).map((r) => r.id)
    const toAdd = allowed.filter((id) => !current.includes(id))
    const toRemove = current.filter((id) => !allowed.includes(id))
    if (toRemove.length)
      await tx
        .delete(taskAssignees)
        .where(and(eq(taskAssignees.taskId, taskId), inArray(taskAssignees.userId, toRemove)))
    if (toAdd.length)
      await tx
        .insert(taskAssignees)
        .values(toAdd.map((u) => ({ taskId, userId: u, assignedBy: user.id })))
    if (toAdd.length || toRemove.length)
      await logActivity(tx, taskId, user.id, "assignees", {
        added: toAdd.length,
        removed: toRemove.length,
      })
    return toAdd
  })
  await notify(added, user, ws.workspaceId, "task_assigned", taskId, task.title)
  if (allowed.length < new Set(userIds).size)
    throw new UserFacingError("Some people can't see this space, so they weren't assigned.")
}

export async function setLabels(user: CurrentUser, taskId: string, labelIds: string[]) {
  await requireTask(user, taskId)
  try {
    await withRls(user.claims, async (tx) => {
      await tx.delete(taskLabelLinks).where(eq(taskLabelLinks.taskId, taskId))
      const unique = [...new Set(labelIds)]
      if (unique.length)
        await tx.insert(taskLabelLinks).values(unique.map((labelId) => ({ taskId, labelId })))
      await logActivity(tx, taskId, user.id, "labels", { count: unique.length })
    })
  } catch (e) {
    if (pgCode(e) === "42501") throw new AccessDeniedError()
    throw e
  }
}

export async function createLabel(
  user: CurrentUser,
  spaceId: string,
  name: string,
  tone: "neutral" | "brand" | "attention" | "danger"
) {
  try {
    const [l] = await withRls(user.claims, (tx) =>
      tx.insert(taskLabels).values({ spaceId, name, tone }).returning({ id: taskLabels.id })
    )
    return l.id
  } catch (e) {
    if (pgCode(e) === "23505") throw new UserFacingError("There's already a label with that name.")
    if (pgCode(e) === "42501") throw new AccessDeniedError()
    throw e
  }
}

export async function archiveTask(user: CurrentUser, taskId: string) {
  await requireTask(user, taskId)
  await withRls(user.claims, async (tx) => {
    await tx
      .update(tasks)
      .set({ archivedAt: sql`now()` })
      .where(eq(tasks.id, taskId))
    await logActivity(tx, taskId, user.id, "archived")
  })
}

// Checklist
export async function addChecklistItem(user: CurrentUser, taskId: string, body: string) {
  await requireTask(user, taskId)
  await withRls(user.claims, (tx) =>
    tx.insert(taskChecklistItems).values({ taskId, body, position: Date.now() })
  )
}
export async function toggleChecklistItem(user: CurrentUser, itemId: string, done: boolean) {
  const rows = await withRls(user.claims, (tx) =>
    tx
      .update(taskChecklistItems)
      .set({ done })
      .where(eq(taskChecklistItems.id, itemId))
      .returning({ id: taskChecklistItems.id })
  )
  if (!rows.length) throw new AccessDeniedError()
}
export async function removeChecklistItem(user: CurrentUser, itemId: string) {
  const rows = await withRls(user.claims, (tx) =>
    tx
      .delete(taskChecklistItems)
      .where(eq(taskChecklistItems.id, itemId))
      .returning({ id: taskChecklistItems.id })
  )
  if (!rows.length) throw new AccessDeniedError()
}

// Comments
export async function addTaskComment(
  user: CurrentUser,
  taskId: string,
  body: string,
  mentionIds: string[]
) {
  const task = await requireTask(user, taskId)
  const ws = await workspaceOfList(task.listId)
  const mentions = await readersOf(
    ws.spaceId,
    [...new Set(mentionIds)].filter((id) => id !== user.id)
  )
  await withRls(user.claims, (tx) =>
    tx.insert(taskComments).values({ taskId, authorId: user.id, body, mentions })
  )
  await notify(mentions, user, ws.workspaceId, "task_mention", taskId, body)
}
export async function deleteTaskComment(user: CurrentUser, commentId: string) {
  const rows = await withRls(user.claims, (tx) =>
    tx
      .update(taskComments)
      .set({ deletedAt: sql`now()` })
      .where(and(eq(taskComments.id, commentId), eq(taskComments.authorId, user.id)))
      .returning({ id: taskComments.id })
  )
  if (!rows.length) throw new AccessDeniedError()
}

// Attachments
export async function createTaskAttachmentUpload(
  user: CurrentUser,
  taskId: string,
  file: { name: string; mimeType: string; sizeBytes: number }
) {
  const task = await requireTask(user, taskId)
  if (file.sizeBytes <= 0 || file.sizeBytes > 100 * 1024 * 1024)
    throw new UserFacingError("Files can be up to 100 MB.")
  if (!(await takeToken("upload", user.id)))
    throw new UserFacingError("You've uploaded a lot today. Try again in an hour.")
  const ws = await workspaceOfList(task.listId)
  const id = crypto.randomUUID()
  const key = `ws/${ws.workspaceId}/tasks/${taskId}/${id}`
  const type = file.mimeType.slice(0, 100) || "application/octet-stream"
  const name = file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 200) || "file"
  await withRls(user.claims, (tx) =>
    tx
      .insert(taskAttachments)
      .values({
        id,
        taskId,
        uploaderId: user.id,
        objectKey: key,
        name,
        mimeType: type,
        sizeBytes: file.sizeBytes,
      })
  )
  return { attachmentId: id, uploadUrl: await presignUpload(key, type), contentType: type }
}
export async function confirmTaskAttachment(user: CurrentUser, attachmentId: string) {
  const rows = await withRls(user.claims, (tx) =>
    tx
      .update(taskAttachments)
      .set({ uploaded: true })
      .where(and(eq(taskAttachments.id, attachmentId), eq(taskAttachments.uploaderId, user.id)))
      .returning({ taskId: taskAttachments.taskId })
  )
  if (!rows.length) throw new AccessDeniedError()
  await withRls(user.claims, (tx) => logActivity(tx, rows[0].taskId, user.id, "attachment"))
}
export async function taskAttachmentUrl(user: CurrentUser, attachmentId: string) {
  const [a] = await withRls(user.claims, (tx) =>
    tx
      .select({ key: taskAttachments.objectKey, name: taskAttachments.name })
      .from(taskAttachments)
      .where(and(eq(taskAttachments.id, attachmentId), eq(taskAttachments.uploaded, true)))
  )
  if (!a) throw new AccessDeniedError()
  return presignRead(a.key, { ttl: 120, filename: a.name })
}

// ── Detail ──────────────────────────────────────────────────────────────────

export async function getTaskDetail(user: CurrentUser, taskId: string) {
  if (!(await canReadTask(user, taskId))) return null
  const data = await withRls(user.claims, async (tx) => {
    const [task] = await tx.select().from(tasks).where(eq(tasks.id, taskId))
    if (!task) return null
    const [assignees, labelIds, checklist, subtasks, comments, activity, attachments] =
      await Promise.all([
        tx
          .select({ id: taskAssignees.userId })
          .from(taskAssignees)
          .where(eq(taskAssignees.taskId, taskId)),
        tx
          .select({ id: taskLabelLinks.labelId })
          .from(taskLabelLinks)
          .where(eq(taskLabelLinks.taskId, taskId)),
        tx
          .select()
          .from(taskChecklistItems)
          .where(eq(taskChecklistItems.taskId, taskId))
          .orderBy(asc(taskChecklistItems.position)),
        tx
          .select({ id: tasks.id, title: tasks.title, completedAt: tasks.completedAt })
          .from(tasks)
          .where(and(eq(tasks.parentId, taskId), isNull(tasks.archivedAt)))
          .orderBy(asc(tasks.position)),
        tx
          .select()
          .from(taskComments)
          .where(and(eq(taskComments.taskId, taskId), isNull(taskComments.deletedAt)))
          .orderBy(asc(taskComments.createdAt)),
        tx
          .select()
          .from(taskActivity)
          .where(eq(taskActivity.taskId, taskId))
          .orderBy(desc(taskActivity.createdAt))
          .limit(50),
        tx
          .select({
            id: taskAttachments.id,
            name: taskAttachments.name,
            sizeBytes: taskAttachments.sizeBytes,
          })
          .from(taskAttachments)
          .where(and(eq(taskAttachments.taskId, taskId), eq(taskAttachments.uploaded, true))),
      ])
    let channel: { id: string; name: string } | null = null
    if (task.channelId) {
      const [c] = await tx
        .select({ id: chatChannels.id, name: chatChannels.name, kind: chatChannels.kind })
        .from(chatChannels)
        .where(eq(chatChannels.id, task.channelId))
      if (c) channel = { id: c.id, name: c.kind === "dm" ? "a direct message" : `#${c.name}` }
    }
    let source: { channelId: string; messageId: string; parentId: string | null } | null = null
    if (task.sourceMessageId) {
      const [m] = await tx
        .select({ channelId: chatMessages.channelId, parentId: chatMessages.parentId })
        .from(chatMessages)
        .where(eq(chatMessages.id, task.sourceMessageId))
      if (m)
        source = { channelId: m.channelId, messageId: task.sourceMessageId, parentId: m.parentId }
    }
    return {
      task,
      assignees,
      labelIds,
      checklist,
      subtasks,
      comments,
      activity,
      attachments,
      channel,
      source,
    }
  })
  if (!data) return null
  let video: { id: string; title: string } | null = null
  if (data.task.videoId && (await getVideoRole(user, data.task.videoId))) {
    const [v] = await withRls(user.claims, (tx) =>
      tx.select({ title: videos.title }).from(videos).where(eq(videos.id, data.task.videoId!))
    )
    if (v) video = { id: data.task.videoId, title: v.title }
  }
  const names = await namesFor([
    ...data.comments.map((c) => c.authorId),
    ...data.activity.map((a) => a.actorId ?? ""),
    data.task.createdBy,
  ])
  return {
    ...data,
    video,
    comments: data.comments.map((c) => ({ ...c, authorName: names.get(c.authorId) ?? "Someone" })),
    activity: data.activity.map((a) => ({
      ...a,
      actorName: (a.actorId && names.get(a.actorId)) || "Someone",
    })),
    createdByName: names.get(data.task.createdBy) ?? "Someone",
  }
}

// ── From chat and video ─────────────────────────────────────────────────────

/** Turn a chat message into a task. You must be able to read the message and the list. */
export async function taskFromMessage(user: CurrentUser, messageId: string, listId: string) {
  const [m] = await withRls(user.claims, (tx) =>
    tx
      .select({
        body: chatMessages.body,
        authorId: chatMessages.authorId,
        channelId: chatMessages.channelId,
      })
      .from(chatMessages)
      .where(and(eq(chatMessages.id, messageId), isNull(chatMessages.deletedAt)))
  )
  if (!m) throw new AccessDeniedError()
  const firstLine = m.body.split("\n").find((l) => l.trim()) ?? "Follow up on a message"
  const title = firstLine.trim().slice(0, 120)
  const description = {
    type: "doc",
    content: [
      {
        type: "blockquote",
        content: [
          {
            type: "paragraph",
            content: m.body ? [{ type: "text", text: m.body.slice(0, 4000) }] : [],
          },
        ],
      },
    ],
  }
  return createTask(user, listId, {
    title,
    description,
    sourceMessageId: messageId,
    channelId: m.channelId,
  })
}

/** Turn a video into a task. Only people who can watch the video see the link from the task. */
export async function taskFromVideo(user: CurrentUser, videoId: string, listId: string) {
  if (!(await getVideoRole(user, videoId))) throw new AccessDeniedError()
  const [v] = await withRls(user.claims, (tx) =>
    tx.select({ title: videos.title }).from(videos).where(eq(videos.id, videoId))
  )
  return createTask(user, listId, { title: `Follow up: ${v.title}`.slice(0, 300), videoId })
}

/** Lists this person can add tasks to, for "Make a task" pickers. */
export async function listTargets(user: CurrentUser, slug: string) {
  const tree = await listTaskTree(user, slug)
  return tree.flatMap((s) => s.lists.map((l) => ({ id: l.id, name: l.name, spaceName: s.name })))
}

// ── Saved views ─────────────────────────────────────────────────────────────

export async function listSavedViews(user: CurrentUser, listId: string) {
  return withRls(user.claims, (tx) =>
    tx
      .select()
      .from(taskSavedViews)
      .where(and(eq(taskSavedViews.listId, listId), eq(taskSavedViews.userId, user.id)))
      .orderBy(asc(taskSavedViews.name))
  )
}
export async function saveView(
  user: CurrentUser,
  listId: string,
  name: string,
  view: "list" | "board" | "calendar" | "timeline",
  filters: TaskFilters
) {
  try {
    const [r] = await withRls(user.claims, (tx) =>
      tx
        .insert(taskSavedViews)
        .values({ userId: user.id, listId, name, view, filters })
        .returning({ id: taskSavedViews.id })
    )
    return r.id
  } catch (e) {
    if (pgCode(e) === "42501") throw new AccessDeniedError()
    throw e
  }
}
export async function deleteSavedView(user: CurrentUser, viewId: string) {
  await withRls(user.claims, (tx) =>
    tx
      .delete(taskSavedViews)
      .where(and(eq(taskSavedViews.id, viewId), eq(taskSavedViews.userId, user.id)))
  )
}

// ── Reminders (scheduled job, system connection) ────────────────────────────

/**
 * Due-soon (today or tomorrow) and overdue notifications, sent once per task each.
 * Dates are compared in UTC for now; a per-workspace time zone comes later.
 */
export async function runReminders(now = new Date()) {
  const today = now.toISOString().slice(0, 10)
  const tomorrow = new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10)
  const due = await systemDb
    .select({
      id: tasks.id,
      title: tasks.title,
      dueDate: tasks.dueDate,
      workspaceId: taskSpaces.workspaceId,
      dueSoon: tasks.dueSoonNotifiedAt,
      overdue: tasks.overdueNotifiedAt,
    })
    .from(tasks)
    .innerJoin(taskLists, eq(taskLists.id, tasks.listId))
    .innerJoin(taskSpaces, eq(taskSpaces.id, taskLists.spaceId))
    .where(
      and(
        isNull(tasks.completedAt),
        isNull(tasks.archivedAt),
        sql`${tasks.dueDate} is not null`,
        or(
          and(sql`${tasks.dueDate} < ${today}::date`, isNull(tasks.overdueNotifiedAt)),
          and(
            sql`${tasks.dueDate} in (${today}::date, ${tomorrow}::date)`,
            isNull(tasks.dueSoonNotifiedAt)
          )
        )
      )
    )
    .limit(1000)
  let sent = 0
  for (const t of due) {
    const overdue = t.dueDate! < today
    const people = (
      await systemDb
        .select({ id: taskAssignees.userId })
        .from(taskAssignees)
        .where(eq(taskAssignees.taskId, t.id))
    ).map((r) => r.id)
    if (people.length) {
      await systemDb
        .insert(notifications)
        .values(
          people.map((userId) => ({
            userId,
            workspaceId: t.workspaceId,
            kind: overdue ? "task_overdue" : "task_due_soon",
            targetType: "task",
            targetId: t.id,
            preview: t.title.slice(0, 140),
          }))
        )
      sent += people.length
    }
    await systemDb
      .update(tasks)
      .set(overdue ? { overdueNotifiedAt: sql`now()` } : { dueSoonNotifiedAt: sql`now()` })
      .where(eq(tasks.id, t.id))
  }
  return { tasks: due.length, notifications: sent }
}
