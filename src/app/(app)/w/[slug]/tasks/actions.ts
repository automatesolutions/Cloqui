"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { requireUser } from "@/server/auth"
import { AccessDeniedError } from "@/server/authz"
import {
  addChecklistItem,
  addTaskComment,
  archiveTask,
  confirmTaskAttachment,
  createLabel,
  createList,
  createSpace,
  createTask,
  createTaskAttachmentUpload,
  deleteSavedView,
  deleteTaskComment,
  getListView,
  getTaskDetail,
  listTargets,
  moveTask,
  removeChecklistItem,
  saveView,
  setAssignees,
  setLabels,
  taskAttachmentUrl,
  taskFromMessage,
  taskFromVideo,
  toggleChecklistItem,
  updateTask,
} from "@/server/tasks"
import { UserFacingError } from "@/server/workspaces"

type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string }
const id = z.uuid()
const date = z.iso.date().nullable()
const priority = z.enum(["urgent", "high", "normal", "low", "none"])

function fail(e: unknown): { ok: false; message: string } {
  if (e instanceof UserFacingError) return { ok: false, message: e.message }
  if (e instanceof AccessDeniedError)
    return { ok: false, message: "You don't have access to that." }
  if (e instanceof z.ZodError)
    return { ok: false, message: e.issues[0]?.message ?? "Check the details and try again." }
  console.error("task action failed", (e as Error)?.name)
  return { ok: false, message: "That didn't work. Try again in a moment." }
}

async function run<T extends object>(
  fn: () => Promise<T | void>,
  revalidate?: string
): Promise<Result<T>> {
  try {
    const r = (await fn()) ?? ({} as T)
    if (revalidate) revalidatePath(revalidate, "layout")
    return { ok: true, ...r }
  } catch (e) {
    return fail(e)
  }
}

// Tiptap JSON, capped so nobody stores megabytes in a description.
const doc = z
  .record(z.string(), z.unknown())
  .nullable()
  .refine((v) => v === null || JSON.stringify(v).length <= 100_000, {
    error: "That description is too long.",
  })

export async function createSpaceAction(
  slug: string,
  input: { name: string; isPrivate: boolean; memberIds: string[] }
): Promise<Result> {
  let listId: string
  try {
    const user = await requireUser()
    const spaceId = await createSpace(user, slug, {
      name: z.string().trim().min(1, { error: "Add a name." }).max(60).parse(input.name),
      isPrivate: !!input.isPrivate,
      memberIds: z.array(id).max(200).parse(input.memberIds),
    })
    // Every new space starts with one list, so there's somewhere to put tasks.
    listId = await createList(user, spaceId, { name: "Tasks" })
  } catch (e) {
    return fail(e)
  }
  revalidatePath(`/w/${slug}/tasks`, "layout")
  redirect(`/w/${slug}/tasks/${listId}`)
}

export async function createListAction(
  slug: string,
  spaceId: string,
  name: string
): Promise<Result> {
  let listId: string
  try {
    listId = await createList(await requireUser(), id.parse(spaceId), {
      name: z.string().trim().min(1, { error: "Add a name." }).max(80).parse(name),
    })
  } catch (e) {
    return fail(e)
  }
  revalidatePath(`/w/${slug}/tasks`, "layout")
  redirect(`/w/${slug}/tasks/${listId}`)
}

export async function quickAddAction(
  listId: string,
  title: string,
  statusId?: string,
  parentId?: string
) {
  return run(async () => ({
    id: await createTask(await requireUser(), id.parse(listId), {
      title: z.string().trim().min(1, { error: "Add a title." }).max(300).parse(title),
      statusId: statusId ? id.parse(statusId) : undefined,
      parentId: parentId ? id.parse(parentId) : null,
    }),
  }))
}

export async function updateTaskAction(
  taskId: string,
  patch: {
    title?: string
    description?: Record<string, unknown> | null
    statusId?: string
    priority?: string
    startDate?: string | null
    dueDate?: string | null
    estimateMinutes?: number | null
    channelId?: string | null
  }
) {
  return run(async () => {
    const parsed = z
      .object({
        title: z.string().trim().min(1, { error: "Add a title." }).max(300).optional(),
        description: doc.optional(),
        statusId: id.optional(),
        priority: priority.optional(),
        startDate: date.optional(),
        dueDate: date.optional(),
        estimateMinutes: z.number().int().positive().max(100000).nullable().optional(),
        channelId: id.nullable().optional(),
      })
      .parse(patch)
    await updateTask(await requireUser(), id.parse(taskId), parsed)
  })
}

export async function moveTaskAction(taskId: string, statusId: string, position: number) {
  return run(async () =>
    moveTask(
      await requireUser(),
      id.parse(taskId),
      id.parse(statusId),
      z.number().finite().parse(position)
    )
  )
}

export async function setAssigneesAction(taskId: string, userIds: string[]) {
  return run(async () =>
    setAssignees(await requireUser(), id.parse(taskId), z.array(id).max(20).parse(userIds))
  )
}

export async function setLabelsAction(taskId: string, labelIds: string[]) {
  return run(async () =>
    setLabels(await requireUser(), id.parse(taskId), z.array(id).max(20).parse(labelIds))
  )
}

export async function createLabelAction(spaceId: string, name: string, tone: string) {
  return run(async () => ({
    id: await createLabel(
      await requireUser(),
      id.parse(spaceId),
      z.string().trim().min(1, { error: "Add a label name." }).max(30).parse(name),
      z.enum(["neutral", "brand", "attention", "danger"]).parse(tone)
    ),
  }))
}

export async function archiveTaskAction(taskId: string) {
  return run(async () => archiveTask(await requireUser(), id.parse(taskId)))
}

export async function checklistAddAction(taskId: string, body: string) {
  return run(async () =>
    addChecklistItem(
      await requireUser(),
      id.parse(taskId),
      z.string().trim().min(1).max(300).parse(body)
    )
  )
}
export async function checklistToggleAction(itemId: string, done: boolean) {
  return run(async () => toggleChecklistItem(await requireUser(), id.parse(itemId), done))
}
export async function checklistRemoveAction(itemId: string) {
  return run(async () => removeChecklistItem(await requireUser(), id.parse(itemId)))
}

export async function commentAction(taskId: string, body: string, mentionIds: string[]) {
  return run(async () =>
    addTaskComment(
      await requireUser(),
      id.parse(taskId),
      z.string().trim().min(1, { error: "Write a comment first." }).max(4000).parse(body),
      z.array(id).max(20).parse(mentionIds)
    )
  )
}
export async function deleteCommentAction(commentId: string) {
  return run(async () => deleteTaskComment(await requireUser(), id.parse(commentId)))
}

export async function attachmentUploadAction(
  taskId: string,
  file: { name: string; mimeType: string; sizeBytes: number }
) {
  return run(async () => createTaskAttachmentUpload(await requireUser(), id.parse(taskId), file))
}
export async function attachmentConfirmAction(attachmentId: string) {
  return run(async () => confirmTaskAttachment(await requireUser(), id.parse(attachmentId)))
}
export async function attachmentUrlAction(attachmentId: string) {
  return run(async () => ({
    url: await taskAttachmentUrl(await requireUser(), id.parse(attachmentId)),
  }))
}

export async function taskDetailAction(taskId: string) {
  const user = await requireUser()
  const detail = await getTaskDetail(user, id.parse(taskId))
  if (!detail) return null
  const list = await getListView(user, detail.task.listId)
  return list ? { ...detail, list, viewerId: user.id } : null
}

export async function saveViewAction(
  listId: string,
  name: string,
  view: string,
  filters: Record<string, unknown>
) {
  return run(async () => ({
    id: await saveView(
      await requireUser(),
      id.parse(listId),
      z.string().trim().min(1, { error: "Name the view." }).max(60).parse(name),
      z.enum(["list", "board", "calendar", "timeline"]).parse(view),
      z
        .object({
          assignee: z.union([z.literal("me"), id]).optional(),
          priority: z.array(priority).optional(),
          labelId: id.optional(),
          status: z.enum(["todo", "in_progress", "done"]).optional(),
          q: z.string().max(100).optional(),
        })
        .parse(filters)
    ),
  }))
}
export async function deleteViewAction(viewId: string) {
  return run(async () => deleteSavedView(await requireUser(), id.parse(viewId)))
}

// From chat and video
export async function listTargetsAction(slug: string) {
  return listTargets(await requireUser(), slug)
}
export async function taskFromMessageAction(
  slug: string,
  messageId: string,
  listId: string
): Promise<Result<{ url: string }>> {
  return run(async () => {
    const taskId = await taskFromMessage(await requireUser(), id.parse(messageId), id.parse(listId))
    return { url: `/w/${slug}/tasks/${listId}?task=${taskId}` }
  })
}
export async function taskFromVideoAction(
  slug: string,
  videoId: string,
  listId: string
): Promise<Result<{ url: string }>> {
  return run(async () => {
    const taskId = await taskFromVideo(await requireUser(), id.parse(videoId), id.parse(listId))
    return { url: `/w/${slug}/tasks/${listId}?task=${taskId}` }
  })
}
