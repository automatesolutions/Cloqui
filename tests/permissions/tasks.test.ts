import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { sql } from "drizzle-orm"
import type { CurrentUser } from "@/server/auth"
import { AccessDeniedError } from "@/server/authz"
import { createChannel, listNotifications, postMessage } from "@/server/chat"
import { systemDb } from "@/server/db"
import { putObject } from "@/server/media/storage"
import {
  addTaskComment,
  createList,
  createSpace,
  createTask,
  createTaskAttachmentUpload,
  confirmTaskAttachment,
  getListView,
  getTaskDetail,
  listSavedViews,
  listTasks,
  listTaskTree,
  myTasks,
  runReminders,
  saveView,
  setAssignees,
  taskAttachmentUrl,
  taskFromMessage,
  taskFromVideo,
  updateTask,
} from "@/server/tasks"
import { completeUpload, createVideoUpload } from "@/server/videos"
import { createWorkspace, UserFacingError } from "@/server/workspaces"
import {
  addMember,
  attempt,
  cleanupUsers,
  makeUser,
  runId,
  visibleCount,
  wsIdBySlug,
} from "./helpers"

const slug = `tasks-${runId}`
let ana: CurrentUser, ben: CurrentUser, cy: CurrentUser, guest: CurrentUser, stranger: CurrentUser
let openSpace: string, privateSpace: string, openList: string, privateList: string

beforeAll(async () => {
  ;[ana, ben, cy, guest, stranger] = await Promise.all([
    makeUser("t-ana"),
    makeUser("t-ben"),
    makeUser("t-cy"),
    makeUser("t-guest"),
    makeUser("t-stranger"),
  ])
  await createWorkspace(ana, "Tasks", slug)
  const ws = await wsIdBySlug(slug)
  await addMember(ws, ben.id, "member")
  await addMember(ws, cy.id, "member")
  await addMember(ws, guest.id, "guest")
  openSpace = await createSpace(ana, slug, { name: "Product", isPrivate: false, memberIds: [] })
  privateSpace = await createSpace(ana, slug, {
    name: "Hiring",
    isPrivate: true,
    memberIds: [ben.id],
  })
  openList = await createList(ana, openSpace, { name: "Roadmap" })
  privateList = await createList(ana, privateSpace, { name: "Candidates" })
})

afterAll(async () => {
  await systemDb.execute(sql`delete from public.workspaces where slug = ${slug}`)
  await cleanupUsers()
})

describe("spaces and lists", () => {
  it("open spaces are for full members; private spaces only for their members", async () => {
    const forCy = await listTaskTree(cy, slug)
    expect(forCy.map((s) => s.id)).toContain(openSpace)
    expect(forCy.map((s) => s.id)).not.toContain(privateSpace)
    expect((await listTaskTree(ben, slug)).map((s) => s.id)).toContain(privateSpace)
    expect(await getListView(cy, privateList)).toBeNull()
    expect(await visibleCount(guest, "task_spaces", `id = '${openSpace}'`)).toBe(0)
    expect(await visibleCount(stranger, "task_lists", `id = '${openList}'`)).toBe(0)
  })

  it("each new list gets its own statuses", async () => {
    const view = await getListView(ana, openList)
    expect(view?.statuses.map((s) => s.name)).toEqual(["To do", "In progress", "In review", "Done"])
  })

  it("nobody can join a private space on their own or add outsiders", async () => {
    const self = await attempt(
      cy,
      sql`insert into public.task_space_members (space_id, user_id) values (${privateSpace}, ${cy.id})`
    )
    expect(self.ok).toBe(false)
    const outsider = await attempt(
      ana,
      sql`insert into public.task_space_members (space_id, user_id) values (${privateSpace}, ${stranger.id})`
    )
    expect(outsider.ok).toBe(false)
  })
})

describe("tasks", () => {
  it("private tasks are invisible to non-members", async () => {
    const t = await createTask(ana, privateList, { title: "Offer for Maria" })
    expect(await getTaskDetail(cy, t)).toBeNull()
    await expect(updateTask(cy, t, { title: "hacked" })).rejects.toBeInstanceOf(AccessDeniedError)
    expect(await visibleCount(cy, "tasks", `id = '${t}'`)).toBe(0)
    await expect(createTask(cy, privateList, { title: "sneak" })).rejects.toBeInstanceOf(
      AccessDeniedError
    )
  })

  it("you can only assign people who can see the task", async () => {
    const t = await createTask(ana, privateList, { title: "Schedule interviews" })
    await expect(setAssignees(ana, t, [ben.id, cy.id])).rejects.toBeInstanceOf(UserFacingError)
    const detail = await getTaskDetail(ana, t)
    expect(detail?.assignees.map((a) => a.id)).toEqual([ben.id])
    const direct = await attempt(
      ana,
      sql`insert into public.task_assignees (task_id, user_id) values (${t}, ${cy.id})`
    )
    expect(direct.ok).toBe(false)
    expect(
      (await listNotifications(ben)).some((n) => n.kind === "task_assigned" && n.targetId === t)
    ).toBe(true)
    expect((await listNotifications(cy)).some((n) => n.targetId === t)).toBe(false)
  })

  it("a status from another list is refused", async () => {
    const t = await createTask(ana, openList, { title: "Ship v2" })
    const other = await getListView(ana, privateList)
    await expect(updateTask(ana, t, { statusId: other!.statuses[0].id })).rejects.toBeInstanceOf(
      UserFacingError
    )
  })

  it("moving to a done status marks it complete, and back clears it", async () => {
    const t = await createTask(ana, openList, { title: "Write release notes" })
    const view = await getListView(ana, openList)
    const done = view!.statuses.find((s) => s.kind === "done")!
    await updateTask(ana, t, { statusId: done.id })
    expect((await getTaskDetail(ana, t))?.task.completedAt).not.toBeNull()
    await updateTask(ana, t, { statusId: view!.statuses[0].id })
    expect((await getTaskDetail(ana, t))?.task.completedAt).toBeNull()
  })

  it("comment mentions only notify people who can see the task", async () => {
    const t = await createTask(ana, privateList, { title: "Reference checks" })
    await addTaskComment(ana, t, "@ben @cy please look", [ben.id, cy.id])
    expect(
      (await listNotifications(ben)).some((n) => n.kind === "task_mention" && n.targetId === t)
    ).toBe(true)
    expect((await listNotifications(cy)).some((n) => n.targetId === t)).toBe(false)
  })

  it("filters and my tasks respect access", async () => {
    const t = await createTask(ana, openList, {
      title: "Polish onboarding",
      priority: "high",
      assigneeIds: [cy.id],
    })
    const high = await listTasks(cy, openList, { priority: ["high"] })
    expect(high.map((r) => r.id)).toContain(t)
    expect((await myTasks(cy, slug)).map((r) => r.id)).toContain(t)
    const priv = await createTask(ana, privateList, { title: "Secret", assigneeIds: [ben.id] })
    expect((await myTasks(cy, slug)).map((r) => r.id)).not.toContain(priv)
  })
})

describe("links to chat and video", () => {
  it("you can't make a task from a message you can't read", async () => {
    const secret = await createChannel(ana, slug, {
      name: "secret",
      topic: "",
      isPrivate: true,
      memberIds: [],
    })
    const msg = await postMessage(ana, secret, { body: "Confidential plan" })
    await expect(taskFromMessage(cy, msg, openList)).rejects.toBeInstanceOf(AccessDeniedError)
    const t = await taskFromMessage(ana, msg, openList)
    expect((await getTaskDetail(ana, t))?.task.title).toBe("Confidential plan")
  })

  it("a task's video link is hidden from people who can't watch the video", async () => {
    const up = await createVideoUpload(ana, slug, {
      title: "Private walkthrough",
      mimeType: "video/webm",
      sizeBytes: 5,
    })
    const [row] = await systemDb.execute<{ key: string }>(
      sql`select original_key as key from public.videos where id = ${up.videoId}`
    )
    await putObject(row.key, new TextEncoder().encode("hello"), "video/webm")
    await completeUpload(ana, up.videoId)
    await expect(taskFromVideo(cy, up.videoId, openList)).rejects.toBeInstanceOf(AccessDeniedError)
    const t = await taskFromVideo(ana, up.videoId, openList)
    expect((await getTaskDetail(ana, t))?.video?.title).toBe("Private walkthrough")
    expect((await getTaskDetail(cy, t))?.video).toBeNull()
  })
})

describe("attachments, saved views, reminders", () => {
  it("attachments are only downloadable by people who can see the task", async () => {
    const t = await createTask(ana, privateList, { title: "Contract" })
    const up = await createTaskAttachmentUpload(ana, t, {
      name: "contract.pdf",
      mimeType: "application/pdf",
      sizeBytes: 5,
    })
    const [row] = await systemDb.execute<{ key: string }>(
      sql`select object_key as key from public.task_attachments where id = ${up.attachmentId}`
    )
    await putObject(row.key, new TextEncoder().encode("hello"), "application/pdf")
    await confirmTaskAttachment(ana, up.attachmentId)
    expect(await taskAttachmentUrl(ben, up.attachmentId)).toMatch(/X-Amz-Signature=/)
    await expect(taskAttachmentUrl(cy, up.attachmentId)).rejects.toBeInstanceOf(AccessDeniedError)
  })

  it("saved views belong to their owner", async () => {
    await saveView(ana, openList, "My urgent", "board", { priority: ["urgent"] })
    expect((await listSavedViews(ana, openList)).map((v) => v.name)).toContain("My urgent")
    expect(await listSavedViews(cy, openList)).toEqual([])
    await expect(saveView(cy, privateList, "Peek", "list", {})).rejects.toBeInstanceOf(
      AccessDeniedError
    )
  })

  it("due-soon and overdue reminders go to assignees, once each", async () => {
    const today = new Date().toISOString().slice(0, 10)
    const lastWeek = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10)
    const soon = await createTask(ana, openList, {
      title: "Due today",
      dueDate: today,
      assigneeIds: [cy.id],
    })
    const late = await createTask(ana, openList, {
      title: "Late one",
      dueDate: lastWeek,
      assigneeIds: [cy.id],
    })
    await runReminders()
    const n1 = await listNotifications(cy)
    expect(n1.filter((n) => n.targetId === soon && n.kind === "task_due_soon")).toHaveLength(1)
    expect(n1.filter((n) => n.targetId === late && n.kind === "task_overdue")).toHaveLength(1)
    await runReminders()
    const n2 = await listNotifications(cy)
    const reminders = (n: { kind: string }) =>
      n.kind === "task_due_soon" || n.kind === "task_overdue"
    expect(
      n2.filter((n) => reminders(n) && (n.targetId === soon || n.targetId === late))
    ).toHaveLength(2)
  })
})
