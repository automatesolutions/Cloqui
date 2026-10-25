import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { sql } from "drizzle-orm"
import type { CurrentUser } from "@/server/auth"
import { AccessDeniedError } from "@/server/authz"
import {
  addChannelMembers,
  attachmentUrl,
  createAttachmentUpload,
  createChannel,
  deleteMessage,
  editMessage,
  getChannelView,
  getOrCreateDm,
  listMessages,
  listNotifications,
  listSidebar,
  listThread,
  pinMessage,
  postMessage,
  searchMessages,
  startHuddle,
  toggleChatReaction,
} from "@/server/chat"
import { systemDb, withRls } from "@/server/db"
import { getLiveRole } from "@/server/live"
import { putObject } from "@/server/media/storage"
import { completeUpload, createVideoUpload } from "@/server/videos"
import { createWorkspace } from "@/server/workspaces"
import {
  addMember,
  attempt,
  cleanupUsers,
  makeUser,
  runId,
  visibleCount,
  wsIdBySlug,
} from "./helpers"

const slug = `chat-${runId}`
const otherSlug = `chat2-${runId}`
let alice: CurrentUser,
  bob: CurrentUser,
  carol: CurrentUser,
  guest: CurrentUser,
  stranger: CurrentUser
let openId: string, privateId: string

beforeAll(async () => {
  ;[alice, bob, carol, guest, stranger] = await Promise.all([
    makeUser("c-alice"),
    makeUser("c-bob"),
    makeUser("c-carol"),
    makeUser("c-guest"),
    makeUser("c-stranger"),
  ])
  await createWorkspace(alice, "Chat", slug)
  const ws = await wsIdBySlug(slug)
  await addMember(ws, bob.id, "member")
  await addMember(ws, carol.id, "member")
  await addMember(ws, guest.id, "guest")
  await createWorkspace(stranger, "Elsewhere", otherSlug)
  openId = await createChannel(alice, slug, {
    name: "general",
    topic: "",
    isPrivate: false,
    memberIds: [],
  })
  privateId = await createChannel(alice, slug, {
    name: "secret-plans",
    topic: "",
    isPrivate: true,
    memberIds: [bob.id],
  })
})

afterAll(async () => {
  await systemDb.execute(sql`delete from public.workspaces where slug in (${slug}, ${otherSlug})`)
  await cleanupUsers()
})

describe("channels", () => {
  it("open channels are readable by every full member, not guests or strangers", async () => {
    expect(await getChannelView(carol, openId)).not.toBeNull()
    expect(await getChannelView(guest, openId)).toBeNull()
    expect(await getChannelView(stranger, openId)).toBeNull()
  })

  it("private channels are invisible to non-members, including workspace admins' colleagues", async () => {
    await postMessage(alice, privateId, { body: "The launch date is Friday" })
    expect(await getChannelView(carol, privateId)).toBeNull()
    expect(await visibleCount(carol, "chat_channels", `id = '${privateId}'`)).toBe(0)
    expect(await visibleCount(carol, "chat_messages", `channel_id = '${privateId}'`)).toBe(0)
    await expect(listMessages(carol, privateId)).rejects.toBeInstanceOf(AccessDeniedError)
    await expect(postMessage(carol, privateId, { body: "let me in" })).rejects.toBeInstanceOf(
      AccessDeniedError
    )
    const sidebar = await listSidebar(carol, slug)
    expect(sidebar.channels.map((c) => c.id)).not.toContain(privateId)
  })

  it("nobody can join a private channel on their own", async () => {
    const r = await attempt(
      carol,
      sql`insert into public.chat_members (channel_id, user_id) values (${privateId}, ${carol.id})`
    )
    expect(r.ok).toBe(false)
  })

  it("people outside the workspace can never be added", async () => {
    await expect(addChannelMembers(bob, privateId, [stranger.id])).rejects.toBeInstanceOf(
      AccessDeniedError
    )
    expect(await getChannelView(stranger, privateId)).toBeNull()
  })

  it("search only finds messages from channels you can read", async () => {
    expect((await searchMessages(bob, slug, "launch")).map((r) => r.channelId)).toContain(privateId)
    expect(await searchMessages(carol, slug, "launch")).toEqual([])
  })
})

describe("messages", () => {
  it("only authors edit or delete their messages", async () => {
    const id = await postMessage(bob, openId, { body: "hello" })
    await expect(editMessage(carol, id, "hacked")).rejects.toBeInstanceOf(AccessDeniedError)
    await expect(deleteMessage(carol, id)).rejects.toBeInstanceOf(AccessDeniedError)
    const upd = await attempt(
      carol,
      sql`update public.chat_messages set body = 'hacked' where id = ${id}`
    )
    expect(upd).toMatchObject({ ok: true, count: 0 })
    await editMessage(bob, id, "hello all")
    expect((await listMessages(alice, openId)).find((m) => m.id === id)?.body).toBe("hello all")
  })

  it("anyone who can read can pin and react; outsiders can't", async () => {
    const id = await postMessage(alice, openId, { body: "Pin me" })
    await pinMessage(carol, id, true)
    await toggleChatReaction(carol, id, "👍")
    await expect(pinMessage(stranger, id, true)).rejects.toBeInstanceOf(AccessDeniedError)
    await expect(toggleChatReaction(stranger, id, "👍")).rejects.toBeInstanceOf(AccessDeniedError)
    const msg = (await listMessages(alice, openId)).find((m) => m.id === id)!
    expect(msg.pinned).toBe(true)
    expect(msg.reactions).toEqual([{ emoji: "👍", count: 1, mine: false }])
  })

  it("threads stay in their channel and count replies", async () => {
    const root = await postMessage(alice, openId, { body: "Thread root" })
    await postMessage(bob, openId, { body: "Reply 1", parentId: root })
    await postMessage(carol, openId, { body: "Reply 2", parentId: root })
    const thread = await listThread(alice, root)
    expect(thread.map((m) => m.body)).toEqual(["Thread root", "Reply 1", "Reply 2"])
    expect(thread[0].replyCount).toBe(2)
    await expect(
      postMessage(alice, privateId, { body: "sneak", parentId: root })
    ).rejects.toBeInstanceOf(AccessDeniedError)
  })
})

describe("mentions and notifications", () => {
  it("mentions notify only people who can read the channel", async () => {
    await postMessage(alice, privateId, {
      body: "@carol and @bob look",
      mentionIds: [carol.id, bob.id],
    })
    const bobs = await listNotifications(bob)
    const carols = await listNotifications(carol)
    expect(bobs.some((n) => n.kind === "mention" && n.channelId === privateId)).toBe(true)
    expect(carols.some((n) => n.channelId === privateId)).toBe(false)
  })

  it("notifications are private to their owner", async () => {
    expect(await visibleCount(carol, "notifications", `user_id = '${bob.id}'`)).toBe(0)
    const ins = await attempt(
      carol,
      sql`insert into public.notifications (user_id, workspace_id, kind, target_type, target_id) select ${bob.id}, workspace_id, 'mention', 'x', gen_random_uuid() from public.chat_channels where id = ${openId}`
    )
    expect(ins.ok).toBe(false)
  })
})

describe("direct messages", () => {
  it("the same people always get the same DM, and nobody else can read it", async () => {
    const dm1 = await getOrCreateDm(alice, slug, [bob.id])
    const dm2 = await getOrCreateDm(bob, slug, [alice.id])
    expect(dm1).toBe(dm2)
    await postMessage(alice, dm1, { body: "just us" })
    expect(await getChannelView(carol, dm1)).toBeNull()
    expect((await listNotifications(bob)).some((n) => n.kind === "dm")).toBe(true)
  })

  it("can't DM someone outside the workspace", async () => {
    await expect(getOrCreateDm(alice, slug, [stranger.id])).rejects.toBeInstanceOf(
      AccessDeniedError
    )
  })

  it("can't add people to a DM after it's made", async () => {
    const dm = await getOrCreateDm(alice, slug, [bob.id])
    await expect(addChannelMembers(alice, dm, [carol.id])).rejects.toBeInstanceOf(AccessDeniedError)
  })
})

describe("attachments, video cards, huddles, realtime", () => {
  it("attachments are only downloadable by channel readers", async () => {
    const up = await createAttachmentUpload(bob, privateId, {
      name: "plan.pdf",
      mimeType: "application/pdf",
      sizeBytes: 5,
    })
    const [row] = await systemDb.execute<{ key: string }>(
      sql`select object_key as key from public.chat_attachments where id = ${up.attachmentId}`
    )
    await putObject(row.key, new TextEncoder().encode("hello"), "application/pdf")
    await postMessage(bob, privateId, { body: "attached", attachmentIds: [up.attachmentId] })
    expect(await attachmentUrl(alice, up.attachmentId)).toMatch(/X-Amz-Signature=/)
    await expect(attachmentUrl(carol, up.attachmentId)).rejects.toBeInstanceOf(AccessDeniedError)
  })

  it("a video card hides the video from channel members who can't watch it", async () => {
    const up = await createVideoUpload(alice, slug, {
      title: "Private demo",
      mimeType: "video/webm",
      sizeBytes: 5,
    })
    const [row] = await systemDb.execute<{ key: string }>(
      sql`select original_key as key from public.videos where id = ${up.videoId}`
    )
    await putObject(row.key, new TextEncoder().encode("hello"), "video/webm")
    await completeUpload(alice, up.videoId)
    const msgId = await postMessage(alice, openId, { body: "demo", videoId: up.videoId })
    const forCarol = (await listMessages(carol, openId)).find((m) => m.id === msgId)!
    expect(forCarol.video).toEqual({
      id: up.videoId,
      title: "",
      canWatch: false,
      thumbnailUrl: null,
      durationMs: null,
    })
    const forAlice = (await listMessages(alice, openId)).find((m) => m.id === msgId)!
    expect(forAlice.video).toMatchObject({ title: "Private demo", canWatch: true })
    // Someone can't post a card for a video they can't see.
    await expect(
      postMessage(carol, openId, { body: "x", videoId: up.videoId })
    ).rejects.toBeInstanceOf(AccessDeniedError)
  })

  it("huddles are open to channel readers and nobody else", async () => {
    const roomId = await startHuddle(bob, privateId)
    expect(await getLiveRole(alice, roomId)).toBe("participant")
    expect(await getLiveRole(carol, roomId)).toBeNull()
    expect(await startHuddle(alice, privateId)).toBe(roomId)
  })

  it("realtime topics are authorized by channel access", async () => {
    const check = (u: CurrentUser, topic: string) =>
      withRls(u.claims, (tx) =>
        tx.execute<{ ok: boolean }>(sql`select public.realtime_chat_topic_allowed(${topic}) as ok`)
      ).then((r) => r[0].ok)
    expect(await check(bob, `chat:${privateId}`)).toBe(true)
    expect(await check(carol, `chat:${privateId}`)).toBe(false)
    expect(await check(carol, `chat:${openId}`)).toBe(true)
    expect(await check(carol, "chat:not-a-uuid")).toBe(false)
    expect(await check(carol, "something-else")).toBe(false)
  })
})
