import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { sql } from "drizzle-orm"
import type { CurrentUser } from "@/server/auth"
import { AccessDeniedError } from "@/server/authz"
import { createAutomation, deleteAutomation, listAutomations } from "@/server/automations"
import { createChannel } from "@/server/chat"
import { systemDb } from "@/server/db"
import {
  createList,
  createSpace,
  createTask,
  getListView,
  moveTask,
  updateTask,
} from "@/server/tasks"
import { createWorkspace, UserFacingError } from "@/server/workspaces"
import { addMember, cleanupUsers, makeUser, runId, visibleCount, wsIdBySlug } from "./helpers"

const slug = `auto-${runId}`
let ana: CurrentUser, ben: CurrentUser, cy: CurrentUser, stranger: CurrentUser
let privateList: string, otherList: string, doneStatus: string, otherListStatus: string
let channel: string, anaOnlyChannel: string

async function notificationsFor(user: CurrentUser, taskId: string) {
  return systemDb.execute<{ kind: string }>(
    sql`select kind from public.notifications where user_id = ${user.id} and target_id = ${taskId} and kind = 'task_status'`
  )
}

beforeAll(async () => {
  ;[ana, ben, cy, stranger] = await Promise.all([
    makeUser("au-ana"),
    makeUser("au-ben"),
    makeUser("au-cy"),
    makeUser("au-stranger"),
  ])
  await createWorkspace(ana, "Auto", slug)
  const ws = await wsIdBySlug(slug)
  await addMember(ws, ben.id, "member")
  await addMember(ws, cy.id, "member")
  const space = await createSpace(ana, slug, {
    name: "Hiring",
    isPrivate: true,
    memberIds: [ben.id],
  })
  privateList = await createList(ana, space, { name: "Candidates" })
  otherList = await createList(ana, space, { name: "Other" })
  doneStatus = (await getListView(ana, privateList))!.statuses.find((s) => s.kind === "done")!.id
  otherListStatus = (await getListView(ana, otherList))!.statuses[0].id
  channel = await createChannel(ana, slug, {
    name: "general",
    topic: "",
    isPrivate: false,
    memberIds: [cy.id],
  })
  anaOnlyChannel = await createChannel(ana, slug, {
    name: "ana-only",
    topic: "",
    isPrivate: true,
    memberIds: [],
  })
})

afterAll(async () => {
  await systemDb.execute(sql`delete from public.workspaces where slug = ${slug}`)
  await cleanupUsers()
})

describe("setting up automations", () => {
  it("people who can't see the list can't add, read or remove them", async () => {
    await expect(
      createAutomation(cy, privateList, { statusId: doneStatus, action: "notify_assignees" })
    ).rejects.toBeInstanceOf(AccessDeniedError)
    await expect(
      createAutomation(stranger, privateList, { statusId: doneStatus, action: "notify_assignees" })
    ).rejects.toBeInstanceOf(AccessDeniedError)
    await expect(listAutomations(cy, privateList)).rejects.toBeInstanceOf(AccessDeniedError)

    await createAutomation(ana, privateList, { statusId: doneStatus, action: "notify_assignees" })
    const [rule] = await listAutomations(ana, privateList)
    expect(await visibleCount(cy, "task_automations", `id = '${rule.id}'`)).toBe(0)
    await expect(deleteAutomation(cy, rule.id)).rejects.toBeInstanceOf(AccessDeniedError)
    await expect(deleteAutomation(stranger, rule.id)).rejects.toBeInstanceOf(AccessDeniedError)
  })

  it("can't notify someone who can't see the list", async () => {
    await expect(
      createAutomation(ana, privateList, {
        statusId: doneStatus,
        action: "notify_user",
        targetUserId: cy.id,
      })
    ).rejects.toBeInstanceOf(UserFacingError)
  })

  it("can't use a status from another list", async () => {
    await expect(
      createAutomation(ana, privateList, { statusId: otherListStatus, action: "notify_assignees" })
    ).rejects.toBeInstanceOf(UserFacingError)
  })

  it("can't post to a channel the person setting it up can't read", async () => {
    await expect(
      createAutomation(ben, privateList, {
        statusId: doneStatus,
        action: "post_channel",
        targetChannelId: anaOnlyChannel,
      })
    ).rejects.toBeInstanceOf(UserFacingError)
  })
})

describe("running automations", () => {
  it("moving a task notifies its assignees, but not the person who moved it", async () => {
    const t = await createTask(ana, privateList, {
      title: "Offer for Maria",
      assigneeIds: [ana.id, ben.id],
    })
    await moveTask(ana, t, doneStatus, 1)
    expect(await notificationsFor(ben, t)).toHaveLength(1)
    expect(await notificationsFor(ana, t)).toHaveLength(0)
  })

  it("someone who lost access since setup isn't notified", async () => {
    await createAutomation(ana, privateList, {
      statusId: doneStatus,
      action: "notify_user",
      targetUserId: ben.id,
    })
    const t = await createTask(ana, privateList, { title: "Reference checks" })
    const spaceId = (await getListView(ana, privateList))!.space.id
    await systemDb.execute(
      sql`delete from public.task_space_members where space_id = ${spaceId} and user_id = ${ben.id}`
    )
    await updateTask(ana, t, { statusId: doneStatus })
    expect(await notificationsFor(ben, t)).toHaveLength(0)
    await systemDb.execute(
      sql`insert into public.task_space_members (space_id, user_id, role) values (${spaceId}, ${ben.id}, 'member')`
    )
  })

  it("a channel post links to the task without saying what it is", async () => {
    await createAutomation(ana, privateList, {
      statusId: doneStatus,
      action: "post_channel",
      targetChannelId: channel,
    })
    const t = await createTask(ana, privateList, { title: "Salary for Maria" })
    await updateTask(ana, t, { statusId: doneStatus })
    const posts = await systemDb.execute<{ body: string }>(
      sql`select body from public.chat_messages where channel_id = ${channel} and body like ${`%${t}%`}`
    )
    expect(posts).toHaveLength(1)
    expect(posts[0].body).not.toContain("Salary")
    expect(posts[0].body).not.toContain("Maria")
    // cy is in the channel but not the space: the link doesn't open the task for them.
    expect(await visibleCount(cy, "tasks", `id = '${t}'`)).toBe(0)
  })
})
